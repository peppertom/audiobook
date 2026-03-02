import shutil
from fastapi import APIRouter, Depends, UploadFile, File, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import get_db
from app.config import settings
from app.models import Voice
from app.schemas import VoiceCreate, VoiceOut

router = APIRouter(prefix="/api/voices", tags=["voices"])


@router.post("/", response_model=VoiceOut, status_code=201)
async def create_voice(voice: VoiceCreate, db: AsyncSession = Depends(get_db)):
    db_voice = Voice(**voice.model_dump())
    db.add(db_voice)
    await db.commit()
    await db.refresh(db_voice)
    return db_voice


@router.get("/", response_model=list[VoiceOut])
async def list_voices(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Voice).order_by(Voice.created_at.desc()))
    return result.scalars().all()


@router.get("/{voice_id}", response_model=VoiceOut)
async def get_voice(voice_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Voice).where(Voice.id == voice_id))
    voice = result.scalar_one_or_none()
    if not voice:
        raise HTTPException(404, "Voice not found")
    return voice


@router.post("/{voice_id}/reference-clip", response_model=VoiceOut)
async def upload_reference_clip(
    voice_id: int, file: UploadFile = File(...), db: AsyncSession = Depends(get_db)
):
    result = await db.execute(select(Voice).where(Voice.id == voice_id))
    voice = result.scalar_one_or_none()
    if not voice:
        raise HTTPException(404, "Voice not found")

    clip_path = settings.voices_path / f"voice_{voice_id}_ref.wav"
    with open(clip_path, "wb") as f:
        shutil.copyfileobj(file.file, f)

    voice.reference_clip_path = str(clip_path)
    await db.commit()
    await db.refresh(voice)
    return voice


@router.post("/{voice_id}/from-youtube", response_model=VoiceOut)
async def create_voice_from_youtube(
    voice_id: int, url: str, db: AsyncSession = Depends(get_db)
):
    from app.services.voice_pipeline import download_youtube_audio, extract_vocals

    result = await db.execute(select(Voice).where(Voice.id == voice_id))
    voice = result.scalar_one_or_none()
    if not voice:
        raise HTTPException(404, "Voice not found")

    work_dir = settings.voices_path / f"voice_{voice_id}_work"
    work_dir.mkdir(exist_ok=True)

    # Download and extract vocals (runs synchronously — will be moved to worker later)
    audio_path = download_youtube_audio(url, work_dir)
    vocals_path = extract_vocals(audio_path, work_dir)

    # Store full vocals as sample, user will trim via frontend later
    voice.sample_audio_path = str(vocals_path)
    voice.source = "youtube"
    await db.commit()
    await db.refresh(voice)
    return voice


@router.delete("/{voice_id}", status_code=204)
async def delete_voice(voice_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Voice).where(Voice.id == voice_id))
    voice = result.scalar_one_or_none()
    if not voice:
        raise HTTPException(404, "Voice not found")
    await db.delete(voice)
    await db.commit()
