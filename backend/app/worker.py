"""ARQ worker for TTS generation jobs."""
import asyncio
import functools
import json
import logging
from datetime import datetime
from pathlib import Path
from arq.connections import RedisSettings
from sqlalchemy import select
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from app.config import settings, BACKEND_ROOT
from app.models import Job, Chapter, Voice
from app.database import Base
from app.services.tts_engine import TTSEngine

logger = logging.getLogger(__name__)


async def generate_tts(ctx, job_id: int):
    """Generate TTS audio for a job."""
    engine = ctx["db_engine"]
    tts: TTSEngine = ctx["tts_engine"]
    session_maker = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async with session_maker() as db:
        result = await db.execute(select(Job).where(Job.id == job_id))
        job = result.scalar_one_or_none()
        if not job:
            return

        # Mark processing
        job.status = "processing"
        job.error_message = "Starting TTS generation..."
        await db.commit()
        logger.info(f"Job {job_id}: Started processing")

        try:
            # Load chapter and voice
            ch_result = await db.execute(select(Chapter).where(Chapter.id == job.chapter_id))
            chapter = ch_result.scalar_one()
            v_result = await db.execute(select(Voice).where(Voice.id == job.voice_id))
            voice = v_result.scalar_one()

            if not voice.reference_clip_path:
                raise ValueError("Voice has no reference clip")

            # Resolve reference clip path (may be relative to BACKEND_ROOT)
            ref_clip = Path(voice.reference_clip_path)
            if not ref_clip.is_absolute():
                ref_clip = BACKEND_ROOT / ref_clip
            if not ref_clip.exists():
                raise ValueError(f"Reference clip not found: {ref_clip}")

            job.error_message = f"Generating audio for chapter: {chapter.title[:50]}..."
            await db.commit()
            logger.info(f"Job {job_id}: Generating TTS for chapter '{chapter.title}' ({chapter.word_count} words)")

            # Progress callback — updates DB so frontend can poll.
            # Called from a worker thread (since tts.generate is blocking),
            # schedules async DB updates back on the event loop.
            loop = asyncio.get_running_loop()

            def on_chunk_progress(chunk_idx, total_chunks, preview):
                pct = int((chunk_idx / total_chunks) * 100)
                msg = f"Chunk {chunk_idx + 1}/{total_chunks} ({pct}%) — {preview}..."
                logger.info(f"Job {job_id}: {msg}")

                async def _update():
                    job.error_message = msg
                    await db.commit()

                asyncio.run_coroutine_threadsafe(_update(), loop).result(timeout=10)

            # Run blocking TTS generation in a thread so the event loop stays free
            # for processing progress update coroutines
            output_path = settings.audio_path / f"ch{chapter.id}_v{voice.id}.wav"
            _, timing_data = await loop.run_in_executor(
                None,
                functools.partial(
                    tts.generate,
                    text=chapter.text_content,
                    reference_clip=ref_clip,
                    output_path=output_path,
                    language=voice.language,
                    on_progress=on_chunk_progress,
                ),
            )

            # Store relative path for URL serving
            try:
                relative_output = str(output_path.relative_to(BACKEND_ROOT))
            except ValueError:
                relative_output = str(output_path)

            # Total duration from timing data
            total_duration = timing_data[-1]["end"] if timing_data else None

            # Update job
            job.status = "done"
            job.audio_output_path = relative_output
            job.duration_seconds = total_duration
            job.timing_data = json.dumps(timing_data, ensure_ascii=False)
            job.error_message = None  # Clear any previous error messages
            job.completed_at = datetime.utcnow()
            await db.commit()
            logger.info(f"Job {job_id}: Completed successfully ({len(timing_data)} chunks, {total_duration:.1f}s)")

        except Exception as e:
            job.status = "failed"
            job.error_message = str(e)
            job.completed_at = datetime.utcnow()
            await db.commit()
            logger.error(f"Job {job_id}: Failed with error: {e}")
            raise


async def startup(ctx):
    """Worker startup — load TTS model and DB engine."""
    # Ensure storage directories exist
    for path in [settings.storage_path, settings.audio_path, settings.voices_path]:
        path.mkdir(parents=True, exist_ok=True)

    logger.info(f"Loading TTS model (device will be auto-detected)...")
    tts = TTSEngine()
    tts.load_model()
    logger.info(f"TTS model loaded on device: {tts.device}")

    ctx["tts_engine"] = tts
    ctx["db_engine"] = create_async_engine(settings.database_url, echo=False)


async def shutdown(ctx):
    """Worker shutdown."""
    if "db_engine" in ctx:
        await ctx["db_engine"].dispose()


class WorkerSettings:
    functions = [generate_tts]
    on_startup = startup
    on_shutdown = shutdown
    redis_settings = RedisSettings.from_dsn(settings.redis_url)
    max_jobs = 1
    job_timeout = 600
