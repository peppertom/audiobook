import logging
from arq.connections import ArqRedis, create_pool, RedisSettings
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import get_db
from app.config import settings
from app.models import Job, Chapter, Voice, Book
from app.schemas import JobCreate, JobOut, JobDetailOut
from pydantic import BaseModel

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/jobs", tags=["jobs"])

_arq_pool: ArqRedis | None = None


async def get_arq_pool() -> ArqRedis:
    """Get or create ARQ Redis connection pool for job enqueueing."""
    global _arq_pool
    if _arq_pool is None:
        _arq_pool = await create_pool(RedisSettings.from_dsn(settings.redis_url))
    return _arq_pool


class GenerateBookRequest(BaseModel):
    voice_id: int  # default voice for all chapters
    chapter_voices: dict[int, int] = {}  # optional per-chapter overrides: {chapter_id: voice_id}


@router.post("/", response_model=JobOut, status_code=201)
async def create_job(job: JobCreate, db: AsyncSession = Depends(get_db)):
    # Validate chapter and voice exist
    ch = await db.execute(select(Chapter).where(Chapter.id == job.chapter_id))
    if not ch.scalar_one_or_none():
        raise HTTPException(404, "Chapter not found")
    v = await db.execute(select(Voice).where(Voice.id == job.voice_id))
    if not v.scalar_one_or_none():
        raise HTTPException(404, "Voice not found")

    # Check for existing done job (cache hit)
    existing = await db.execute(
        select(Job).where(Job.chapter_id == job.chapter_id, Job.voice_id == job.voice_id, Job.status == "done")
    )
    if existing.scalar_one_or_none():
        raise HTTPException(409, "Audio already generated for this chapter+voice")

    db_job = Job(chapter_id=job.chapter_id, voice_id=job.voice_id, status="queued")
    db.add(db_job)
    await db.commit()
    await db.refresh(db_job)
    # Jobs are created as "queued" — user must click Start to begin processing
    return db_job


@router.post("/generate-book/{book_id}", response_model=list[JobOut], status_code=201)
async def generate_book(book_id: int, req: GenerateBookRequest, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Book).where(Book.id == book_id))
    if not result.scalar_one_or_none():
        raise HTTPException(404, "Book not found")

    chapters = await db.execute(
        select(Chapter).where(Chapter.book_id == book_id).order_by(Chapter.chapter_number)
    )
    jobs = []
    for chapter in chapters.scalars().all():
        voice_id = req.chapter_voices.get(chapter.id, req.voice_id)
        # Skip if already generated or queued with this voice
        existing = await db.execute(
            select(Job).where(
                Job.chapter_id == chapter.id,
                Job.voice_id == voice_id,
                Job.status.in_(["done", "queued", "processing"]),
            )
        )
        if existing.scalar_one_or_none():
            continue
        job = Job(chapter_id=chapter.id, voice_id=voice_id, status="queued")
        db.add(job)
        jobs.append(job)

    await db.commit()
    for job in jobs:
        await db.refresh(job)
    # Jobs created as "queued" — no auto-enqueue. User clicks Start.
    logger.info(f"Created {len(jobs)} jobs for book {book_id} (queued, not started)")
    return jobs


@router.post("/start-next", response_model=JobOut)
async def start_next_job(db: AsyncSession = Depends(get_db)):
    """Find the next queued job and enqueue it to the worker."""
    # Check if something is already processing
    processing = await db.execute(select(Job).where(Job.status == "processing"))
    if processing.scalar_one_or_none():
        raise HTTPException(409, "A job is already being processed. Wait for it to finish.")

    # Find next queued job (oldest first)
    result = await db.execute(
        select(Job).where(Job.status == "queued").order_by(Job.created_at.asc())
    )
    job = result.scalars().first()
    if not job:
        raise HTTPException(404, "No queued jobs to start")

    # Enqueue to ARQ worker
    try:
        pool = await get_arq_pool()
        await pool.enqueue_job("generate_tts", job.id)
        logger.info(f"Started job {job.id} — enqueued for TTS generation")
    except Exception as e:
        raise HTTPException(503, f"Failed to enqueue job: {e}. Is the worker running?")

    return job


@router.post("/{job_id}/start", response_model=JobOut)
async def start_job(job_id: int, db: AsyncSession = Depends(get_db)):
    """Start a specific queued job."""
    result = await db.execute(select(Job).where(Job.id == job_id))
    job = result.scalar_one_or_none()
    if not job:
        raise HTTPException(404, "Job not found")
    if job.status != "queued":
        raise HTTPException(409, f"Job is {job.status}, can only start queued jobs")

    try:
        pool = await get_arq_pool()
        await pool.enqueue_job("generate_tts", job.id)
        logger.info(f"Started job {job.id} — enqueued for TTS generation")
    except Exception as e:
        raise HTTPException(503, f"Failed to enqueue job: {e}. Is the worker running?")

    return job


@router.post("/start-all", response_model=list[JobOut])
async def start_all_jobs(db: AsyncSession = Depends(get_db)):
    """Enqueue all queued jobs for sequential processing."""
    result = await db.execute(
        select(Job).where(Job.status == "queued").order_by(Job.created_at.asc())
    )
    queued_jobs = list(result.scalars().all())
    if not queued_jobs:
        raise HTTPException(404, "No queued jobs to start")

    try:
        pool = await get_arq_pool()
        for job in queued_jobs:
            await pool.enqueue_job("generate_tts", job.id)
        logger.info(f"Started all {len(queued_jobs)} queued jobs")
    except Exception as e:
        raise HTTPException(503, f"Failed to enqueue jobs: {e}. Is the worker running?")

    return queued_jobs


@router.delete("/{job_id}", status_code=204)
async def cancel_job(job_id: int, db: AsyncSession = Depends(get_db)):
    """Cancel/delete a queued or failed job."""
    result = await db.execute(select(Job).where(Job.id == job_id))
    job = result.scalar_one_or_none()
    if not job:
        raise HTTPException(404, "Job not found")
    if job.status == "processing":
        raise HTTPException(409, "Cannot cancel a job that is currently processing")
    if job.status == "done":
        raise HTTPException(409, "Cannot cancel a completed job. Delete it instead.")
    await db.delete(job)
    await db.commit()


@router.get("/", response_model=list[JobDetailOut])
async def list_jobs(book_id: int | None = None, db: AsyncSession = Depends(get_db)):
    from sqlalchemy.orm import selectinload
    query = select(Job).options(selectinload(Job.chapter), selectinload(Job.voice))
    if book_id is not None:
        query = query.join(Chapter, Job.chapter_id == Chapter.id).where(Chapter.book_id == book_id)
    result = await db.execute(query.order_by(Job.created_at.desc()))
    jobs = result.scalars().all()
    out = []
    for job in jobs:
        detail = JobDetailOut.model_validate(job)
        if job.chapter:
            detail.chapter_title = job.chapter.title
            detail.chapter_number = job.chapter.chapter_number
            # Get book title through chapter
            book_result = await db.execute(select(Book).where(Book.id == job.chapter.book_id))
            book = book_result.scalar_one_or_none()
            detail.book_title = book.title if book else ""
        if job.voice:
            detail.voice_name = job.voice.name
        out.append(detail)
    return out


@router.post("/retry-failed", response_model=list[JobOut])
async def retry_failed_jobs(db: AsyncSession = Depends(get_db)):
    """Reset all failed jobs back to queued (does NOT auto-start)."""
    result = await db.execute(select(Job).where(Job.status == "failed"))
    failed_jobs = list(result.scalars().all())
    if not failed_jobs:
        return []

    for job in failed_jobs:
        job.status = "queued"
        job.error_message = None
        job.completed_at = None
    await db.commit()
    logger.info(f"Reset {len(failed_jobs)} failed jobs to queued")
    return failed_jobs


class UpdateJobVoice(BaseModel):
    voice_id: int


@router.patch("/{job_id}/voice", response_model=JobOut)
async def update_job_voice(job_id: int, req: UpdateJobVoice, db: AsyncSession = Depends(get_db)):
    """Change the voice on a queued job."""
    result = await db.execute(select(Job).where(Job.id == job_id))
    job = result.scalar_one_or_none()
    if not job:
        raise HTTPException(404, "Job not found")
    if job.status != "queued":
        raise HTTPException(409, f"Can only change voice on queued jobs (current: {job.status})")
    v = await db.execute(select(Voice).where(Voice.id == req.voice_id))
    if not v.scalar_one_or_none():
        raise HTTPException(404, "Voice not found")
    job.voice_id = req.voice_id
    await db.commit()
    await db.refresh(job)
    return job


@router.get("/{job_id}", response_model=JobOut)
async def get_job(job_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Job).where(Job.id == job_id))
    job = result.scalar_one_or_none()
    if not job:
        raise HTTPException(404, "Job not found")
    return job
