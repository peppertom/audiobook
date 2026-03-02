"""ARQ worker for TTS generation jobs."""
from arq import create_pool
from arq.connections import RedisSettings
from app.config import settings


# Placeholder TTS task — will be filled in Task 8
async def generate_tts(ctx, job_id: int):
    """Generate TTS audio for a job."""
    # TODO: Load XTTS-v2 model, generate audio, update job status
    pass


async def startup(ctx):
    """Worker startup — load TTS model into memory."""
    # TODO: Load XTTS-v2 model here
    ctx["tts_model"] = None


async def shutdown(ctx):
    """Worker shutdown — cleanup."""
    pass


class WorkerSettings:
    functions = [generate_tts]
    on_startup = startup
    on_shutdown = shutdown
    redis_settings = RedisSettings.from_dsn(settings.redis_url)
    max_jobs = 1  # GPU-bound, process one at a time
    job_timeout = 600  # 10 minutes per chapter
