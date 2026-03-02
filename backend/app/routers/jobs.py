from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import get_db
from app.models import Job, Chapter, Voice, Book
from app.schemas import JobCreate, JobOut
from pydantic import BaseModel

router = APIRouter(prefix="/api/jobs", tags=["jobs"])


class GenerateBookRequest(BaseModel):
    voice_id: int


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

    # TODO: Enqueue ARQ task here once worker is connected
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
        # Skip if already generated
        existing = await db.execute(
            select(Job).where(Job.chapter_id == chapter.id, Job.voice_id == req.voice_id, Job.status == "done")
        )
        if existing.scalar_one_or_none():
            continue
        job = Job(chapter_id=chapter.id, voice_id=req.voice_id, status="queued")
        db.add(job)
        jobs.append(job)

    await db.commit()
    for job in jobs:
        await db.refresh(job)
    return jobs


@router.get("/", response_model=list[JobOut])
async def list_jobs(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Job).order_by(Job.created_at.desc()))
    return result.scalars().all()


@router.get("/{job_id}", response_model=JobOut)
async def get_job(job_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Job).where(Job.id == job_id))
    job = result.scalar_one_or_none()
    if not job:
        raise HTTPException(404, "Job not found")
    return job
