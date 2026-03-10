import logging
import shutil
import subprocess
import tempfile
from pathlib import Path
from fastapi import APIRouter, Depends, UploadFile, File, HTTPException
from sqlalchemy import select, or_
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import get_db
from app.config import settings, BACKEND_ROOT
from app.models import Voice, User
from app.schemas import VoiceCreate, VoiceOut
from app.services import storage
from app.auth import get_current_user

logger = logging.getLogger(__name__)

ALLOWED_AUDIO_EXTENSIONS = {".wav", ".mp3", ".ogg", ".flac", ".m4a", ".aac", ".wma"}


def convert_to_wav(input_path: Path, output_path: Path) -> Path:
    try:
        subprocess.run(
            ["ffmpeg", "-y", "-i", str(input_path), "-ar", "22050", "-ac", "1", str(output_path)],
            check=True, capture_output=True, text=True,
        )
    except FileNotFoundError:
        raise HTTPException(500, "ffmpeg not found")
    except subprocess.CalledProcessError as e:
        raise HTTPException(400, f"Audio conversion failed: {e.stderr.strip() or 'Unknown ffmpeg error'}")
    if input_path != output_path and input_path.exists():
        input_path.unlink()
    return output_path


def to_relative_path(abs_path: Path) -> str:
    try:
        return str(abs_path.relative_to(BACKEND_ROOT))
    except ValueError:
        return str(abs_path)


router = APIRouter(prefix="/api/voices", tags=["voices"])


async def _get_user_voice(voice_id: int, user_id: str, db: AsyncSession) -> Voice:
    """Fetch a voice owned by the current user. Raises 404 if not found or not owned."""
    result = await db.execute(
        select(Voice).where(Voice.id == voice_id, Voice.user_id == user_id)
    )
    voice = result.scalar_one_or_none()
    if not voice:
        raise HTTPException(404, "Voice not found")
    return voice


@router.post("/", response_model=VoiceOut, status_code=201)
async def create_voice(
    voice: VoiceCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    db_voice = Voice(**voice.model_dump(), user_id=user.id)
    db.add(db_voice)
    await db.commit()
    await db.refresh(db_voice)
    return db_voice


@router.get("/", response_model=list[VoiceOut])
async def list_voices(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Returns the user's own voices plus all public voices."""
    result = await db.execute(
        select(Voice)
        .where(or_(Voice.user_id == user.id, Voice.is_public == True))
        .order_by(Voice.is_public.desc(), Voice.created_at.desc())
    )
    return result.scalars().all()


@router.get("/{voice_id}", response_model=VoiceOut)
async def get_voice(
    voice_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Voice).where(
            Voice.id == voice_id,
            or_(Voice.user_id == user.id, Voice.is_public == True),
        )
    )
    voice = result.scalar_one_or_none()
    if not voice:
        raise HTTPException(404, "Voice not found")
    return voice


@router.post("/{voice_id}/reference-clip", response_model=VoiceOut)
async def upload_reference_clip(
    voice_id: int,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    voice = await _get_user_voice(voice_id, user.id, db)

    filename = file.filename or "clip.wav"
    ext = Path(filename).suffix.lower()
    if ext not in ALLOWED_AUDIO_EXTENSIONS:
        raise HTTPException(400, f"Unsupported format. Allowed: {', '.join(ALLOWED_AUDIO_EXTENSIONS)}")

    with tempfile.NamedTemporaryFile(suffix=ext, delete=False) as upload_tmp:
        shutil.copyfileobj(file.file, upload_tmp)
        upload_path = Path(upload_tmp.name)

    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as wav_tmp:
        clip_path = Path(wav_tmp.name)

    try:
        convert_to_wav(upload_path, clip_path)

        if storage.is_remote():
            r2_key = f"voices/voice_{voice_id}_ref.wav"
            storage.upload(clip_path, r2_key)
            voice.reference_clip_path = r2_key
        else:
            settings.voices_path.mkdir(parents=True, exist_ok=True)
            final_path = settings.voices_path / f"voice_{voice_id}_ref.wav"
            clip_path.rename(final_path)
            clip_path = final_path
            voice.reference_clip_path = to_relative_path(clip_path)
    finally:
        if clip_path.exists() and storage.is_remote():
            clip_path.unlink(missing_ok=True)

    await db.commit()
    await db.refresh(voice)
    return voice


@router.post("/{voice_id}/from-youtube", response_model=VoiceOut)
async def create_voice_from_youtube(
    voice_id: int,
    url: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    from app.services.voice_pipeline import download_youtube_audio, extract_vocals

    voice = await _get_user_voice(voice_id, user.id, db)

    work_dir = settings.voices_path / f"voice_{voice_id}_work"
    work_dir.mkdir(exist_ok=True)

    audio_path = download_youtube_audio(url, work_dir)
    vocals_path = extract_vocals(audio_path, work_dir)

    voice.sample_audio_path = str(vocals_path)
    voice.source = "youtube"
    await db.commit()
    await db.refresh(voice)
    return voice


@router.delete("/{voice_id}", status_code=204)
async def delete_voice(
    voice_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    voice = await _get_user_voice(voice_id, user.id, db)
    await db.delete(voice)
    await db.commit()
