"""ARQ worker for TTS generation jobs."""
import asyncio
import functools
import json
import logging
import time
from datetime import datetime
from pathlib import Path
from arq.connections import RedisSettings
from sqlalchemy import select
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from app.config import settings, BACKEND_ROOT
from app.models import Job, Chapter, Voice
from app.database import Base
from app.services.tts_engine import TTSEngine
from app.services.llm_annotator import LLMAnnotator

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%H:%M:%S",
)
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

            # Fejezet-szintű érzelmi ív elemzés (ha még nincs)
            annotator: LLMAnnotator = ctx.get("llm_annotator")
            if annotator and not chapter.emotional_arc:
                logger.info(f"Job {job_id}: Running LLM arc analysis...")
                arc = await annotator.analyze_chapter_arc(chapter.text_content)
                chapter.emotional_arc = json.dumps({
                    "dominant_emotion": arc.dominant_emotion,
                    "pacing": arc.pacing,
                    "intensity": arc.intensity,
                    "narrator_note": arc.narrator_note,
                }, ensure_ascii=False)
                await db.commit()
                logger.info(f"Job {job_id}: Arc: {arc.dominant_emotion} | intensity={arc.intensity}")

            job.error_message = f"Generating audio for chapter: {chapter.title[:50]}..."
            await db.commit()
            logger.info(f"Job {job_id}: Generating TTS for chapter '{chapter.title}' ({chapter.word_count} words)")

            # Progress callback — updates DB with JSON so frontend can poll.
            # Called from a worker thread (since tts.generate is blocking),
            # schedules async DB updates back on the event loop.
            loop = asyncio.get_running_loop()
            start_time = time.time()

            def on_chunk_progress(event, chunk_idx, total_chunks, chunk_word_counts, **kwargs):
                elapsed = time.time() - start_time
                total_words = sum(chunk_word_counts)

                if event == "chunk_start":
                    words_done = sum(chunk_word_counts[:chunk_idx])
                    preview = kwargs.get("preview", "")
                elif event == "chunk_done":
                    words_done = sum(chunk_word_counts[:chunk_idx + 1])
                    preview = kwargs.get("preview", "")
                else:
                    return

                pct = int((words_done / total_words) * 100) if total_words else 0

                # ETA: only estimate after first chunk_done (need real speed data)
                eta_s = None
                if event == "chunk_done" and elapsed > 0 and words_done > 0:
                    words_per_sec = words_done / elapsed
                    remaining_words = total_words - words_done
                    eta_s = int(remaining_words / words_per_sec) if words_per_sec > 0 else None

                progress = {
                    "chunk": chunk_idx + 1,
                    "total_chunks": total_chunks,
                    "words_done": words_done,
                    "total_words": total_words,
                    "pct": pct,
                    "elapsed_s": int(elapsed),
                    "eta_s": eta_s,
                    "preview": preview,
                }
                progress_json = json.dumps(progress, ensure_ascii=False)

                # Format for logs
                elapsed_fmt = f"{int(elapsed)//60}:{int(elapsed)%60:02d}"
                eta_fmt = f"~{eta_s//60}:{eta_s%60:02d}" if eta_s is not None else "calculating..."
                logger.info(
                    f"Job {job_id}: {words_done}/{total_words} words ({pct}%) "
                    f"| {elapsed_fmt} elapsed | ETA {eta_fmt} "
                    f'| "{preview[:60]}..."'
                )

                async def _update():
                    job.error_message = progress_json
                    await db.commit()

                asyncio.run_coroutine_threadsafe(_update(), loop).result(timeout=10)

            # Build TTS text: use normalized segments if available, else raw text
            if chapter.segments:
                raw_segments = json.loads(chapter.segments)
                tts_text = " ".join(
                    s["text"] for s in raw_segments if not s.get("is_heading")
                )
            else:
                tts_text = chapter.text_content

            # Run blocking TTS generation in a thread so the event loop stays free
            # for processing progress update coroutines
            output_path = settings.audio_path / f"ch{chapter.id}_v{voice.id}.wav"
            _, timing_data = await loop.run_in_executor(
                None,
                functools.partial(
                    tts.generate,
                    text=tts_text,
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

        except BaseException as e:
            # BaseException catches CancelledError (arq timeout) + all Exceptions
            job.status = "failed"
            job.error_message = f"Timeout — TTS took too long" if isinstance(e, (asyncio.CancelledError, TimeoutError)) else str(e)
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
    ctx["llm_annotator"] = LLMAnnotator(
        base_url=settings.ollama_url,
        model=settings.ollama_model,
    )
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
    job_timeout = 3600  # 1 hour — CPU TTS is ~50x slower than GPU
