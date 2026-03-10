import logging
from arq.connections import ArqRedis, create_pool, RedisSettings
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, or_
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import get_db
from app.config import settings
from app.models import Job, Chapter, Voice, Book, User
from app.schemas import JobCreate, JobOut, JobDetailOut
from app.auth import get_current_user
from pydantic import BaseModel

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/jobs", tags=["jobs"])

_arq_pool: ArqRedis | None = None


async def get_arq_pool() -> ArqRedis:
    global _arq_pool
    if _arq_pool is None:
        _arq_pool = await create_pool(RedisSettings.from_dsn(settings.redis_url))
    return _arq_pool


async def _get_user_job(job_id: int, user_id: str, db: AsyncSession) -> Job:
    """Fetch a job owned by the current user. Raises 404 if not found or not owned."""
    result = await db.execute(select(Job).where(Job.id == job_id, Job.user_id == user_id))
    job = result.scalar_one_or_none()
    if not job:
        raise HTTPException(404, "Job not found")
    return job


async def _get_accessible_voice(voice_id: int, user_id: str, db: AsyncSession) -> Voice:
    """Get a voice the user can use (their own or public). Raises 404 if inaccessible."""
    result = await db.execute(
        select(Voice).where(
            Voice.id == voice_id,
            or_(Voice.user_id == user_id, Voice.is_public == True),
        )
    )
    voice = result.scalar_one_or_none()
    if not voice:
        raise HTTPException(404, "Voice not found")
    return voice


class GenerateBookRequest(BaseModel):
    voice_id: int
    chapter_voices: dict[int, int] = {}


@router.post("/", response_model=JobOut, status_code=201)
async def create_job(
    job: JobCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    # Verify chapter belongs to a book owned by this user
    ch_result = await db.execute(select(Chapter).where(Chapter.id == job.chapter_id))
    chapter = ch_result.scalar_one_or_none()
    if not chapter:
        raise HTTPException(404, "Chapter not found")
    book_result = await db.execute(
        select(Book).where(Book.id == chapter.book_id, Book.user_id == user.id)
    )
    if not book_result.scalar_one_or_none():
        raise HTTPException(404, "Chapter not found")

    # Verify voice is accessible (own or public)
    await _get_accessible_voice(job.voice_id, user.id, db)

    # Check for existing done job for this user
    existing = await db.execute(
        select(Job).where(
            Job.chapter_id == job.chapter_id,
            Job.voice_id == job.voice_id,
            Job.user_id == user.id,
            Job.status == "done",
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(409, "Audio already generated for this chapter+voice")

    db_job = Job(chapter_id=job.chapter_id, voice_id=job.voice_id, status="queued", user_id=user.id)
    db.add(db_job)
    await db.commit()
    await db.refresh(db_job)
    return db_job


@router.post("/generate-book/{book_id}", response_model=list[JobOut], status_code=201)
async def generate_book(
    book_id: int,
    req: GenerateBookRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    book_result = await db.execute(select(Book).where(Book.id == book_id, Book.user_id == user.id))
    if not book_result.scalar_one_or_none():
        raise HTTPException(404, "Book not found")

    await _get_accessible_voice(req.voice_id, user.id, db)

    chapters = await db.execute(
        select(Chapter).where(Chapter.book_id == book_id).order_by(Chapter.chapter_number)
    )
    jobs = []
    for chapter in chapters.scalars().all():
        voice_id = req.chapter_voices.get(chapter.id, req.voice_id)
        existing = await db.execute(
            select(Job).where(
                Job.chapter_id == chapter.id,
                Job.voice_id == voice_id,
                Job.user_id == user.id,
                Job.status.in_(["done", "queued", "processing"]),
            )
        )
        if existing.scalar_one_or_none():
            continue
        job = Job(chapter_id=chapter.id, voice_id=voice_id, status="queued", user_id=user.id)
        db.add(job)
        jobs.append(job)

    await db.commit()
    for job in jobs:
        await db.refresh(job)
    logger.info(f"Created {len(jobs)} jobs for book {book_id} (user {user.id})")
    return jobs


@router.post("/start-next", response_model=JobOut)
async def start_next_job(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    processing = await db.execute(
        select(Job).where(Job.user_id == user.id, Job.status == "processing")
    )
    if processing.scalar_one_or_none():
        raise HTTPException(409, "A job is already being processed. Wait for it to finish.")

    result = await db.execute(
        select(Job)
        .where(Job.user_id == user.id, Job.status == "queued")
        .order_by(Job.created_at.asc())
    )
    job = result.scalars().first()
    if not job:
        raise HTTPException(404, "No queued jobs to start")

    try:
        pool = await get_arq_pool()
        await pool.enqueue_job("generate_tts", job.id)
        logger.info(f"Started job {job.id} for user {user.id}")
    except Exception as e:
        raise HTTPException(503, f"Failed to enqueue job: {e}. Is the worker running?")

    return job


@router.post("/{job_id}/start", response_model=JobOut)
async def start_job(
    job_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    job = await _get_user_job(job_id, user.id, db)
    if job.status != "queued":
        raise HTTPException(409, f"Job is {job.status}, can only start queued jobs")

    try:
        pool = await get_arq_pool()
        await pool.enqueue_job("generate_tts", job.id)
        logger.info(f"Started job {job.id} for user {user.id}")
    except Exception as e:
        raise HTTPException(503, f"Failed to enqueue job: {e}. Is the worker running?")

    return job


@router.post("/start-all", response_model=list[JobOut])
async def start_all_jobs(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Job)
        .where(Job.user_id == user.id, Job.status == "queued")
        .order_by(Job.created_at.asc())
    )
    queued_jobs = list(result.scalars().all())
    if not queued_jobs:
        raise HTTPException(404, "No queued jobs to start")

    try:
        pool = await get_arq_pool()
        # Only enqueue the first job — the worker auto-advances to the next
        # after each completes, ensuring fair scheduling across users.
        await pool.enqueue_job("generate_tts", queued_jobs[0].id)
        logger.info(f"Enqueued first of {len(queued_jobs)} queued jobs for user {user.id} (worker will auto-advance)")
    except Exception as e:
        raise HTTPException(503, f"Failed to enqueue jobs: {e}. Is the worker running?")

    return queued_jobs


@router.delete("/{job_id}", status_code=204)
async def cancel_job(
    job_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    job = await _get_user_job(job_id, user.id, db)
    if job.status == "processing":
        raise HTTPException(409, "Cannot cancel a job that is currently processing")
    if job.status == "done":
        raise HTTPException(409, "Cannot cancel a completed job. Delete it instead.")
    await db.delete(job)
    await db.commit()


@router.get("/", response_model=list[JobDetailOut])
async def list_jobs(
    book_id: int | None = None,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    from sqlalchemy.orm import selectinload
    query = (
        select(Job)
        .where(Job.user_id == user.id)
        .options(selectinload(Job.chapter), selectinload(Job.voice))
    )
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
            book_result = await db.execute(select(Book).where(Book.id == job.chapter.book_id))
            book = book_result.scalar_one_or_none()
            detail.book_title = book.title if book else ""
        if job.voice:
            detail.voice_name = job.voice.name
        out.append(detail)
    return out


@router.post("/retry-failed", response_model=list[JobOut])
async def retry_failed_jobs(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Job).where(Job.user_id == user.id, Job.status == "failed")
    )
    failed_jobs = list(result.scalars().all())
    if not failed_jobs:
        return []

    for job in failed_jobs:
        job.status = "queued"
        job.error_message = None
        job.completed_at = None
    await db.commit()
    logger.info(f"Reset {len(failed_jobs)} failed jobs to queued for user {user.id}")
    return failed_jobs


class UpdateJobVoice(BaseModel):
    voice_id: int


@router.patch("/{job_id}/voice", response_model=JobOut)
async def update_job_voice(
    job_id: int,
    req: UpdateJobVoice,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    job = await _get_user_job(job_id, user.id, db)
    if job.status != "queued":
        raise HTTPException(409, f"Can only change voice on queued jobs (current: {job.status})")
    await _get_accessible_voice(req.voice_id, user.id, db)
    job.voice_id = req.voice_id
    await db.commit()
    await db.refresh(job)
    return job


@router.get("/{job_id}", response_model=JobOut)
async def get_job(
    job_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    return await _get_user_job(job_id, user.id, db)
