"""ARQ worker for TTS generation jobs."""
from datetime import datetime
from pathlib import Path
from arq.connections import RedisSettings
from sqlalchemy import select
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from app.config import settings
from app.models import Job, Chapter, Voice
from app.database import Base
from app.services.tts_engine import TTSEngine


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
        await db.commit()

        try:
            # Load chapter and voice
            ch_result = await db.execute(select(Chapter).where(Chapter.id == job.chapter_id))
            chapter = ch_result.scalar_one()
            v_result = await db.execute(select(Voice).where(Voice.id == job.voice_id))
            voice = v_result.scalar_one()

            if not voice.reference_clip_path:
                raise ValueError("Voice has no reference clip")

            # Generate audio
            output_path = settings.audio_path / f"ch{chapter.id}_v{voice.id}.wav"
            tts.generate(
                text=chapter.text_content,
                reference_clip=Path(voice.reference_clip_path),
                output_path=output_path,
                language=voice.language,
            )

            # Update job
            job.status = "done"
            job.audio_output_path = str(output_path)
            job.completed_at = datetime.utcnow()
            await db.commit()

        except Exception as e:
            job.status = "failed"
            job.error_message = str(e)
            job.completed_at = datetime.utcnow()
            await db.commit()
            raise


async def startup(ctx):
    """Worker startup — load TTS model and DB engine."""
    tts = TTSEngine()
    tts.load_model()
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
