import json
import logging
import shutil
import subprocess
from pathlib import Path
from typing import Literal
from fastapi import APIRouter, Depends, UploadFile, File, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import get_db
from app.config import settings, BACKEND_ROOT
from app.models import Voice
from app.schemas import VoiceCreate, VoiceOut

logger = logging.getLogger(__name__)

ALLOWED_AUDIO_EXTENSIONS = {".wav", ".mp3", ".ogg", ".flac", ".m4a", ".aac", ".wma", ".webm"}


def convert_to_wav(input_path: Path, output_path: Path) -> Path:
    """Convert any audio format to WAV (22050Hz mono) for XTTS-v2 compatibility."""
    try:
        result = subprocess.run(
            ["ffmpeg", "-y", "-i", str(input_path), "-ar", "22050", "-ac", "1", str(output_path)],
            check=True,
            capture_output=True,
            text=True,
        )
    except FileNotFoundError:
        raise HTTPException(500, "ffmpeg not found. Install ffmpeg to enable audio conversion.")
    except subprocess.CalledProcessError as e:
        logger.error(f"ffmpeg conversion failed: {e.stderr}")
        raise HTTPException(400, f"Audio conversion failed: {e.stderr.strip() if e.stderr else 'Unknown ffmpeg error'}")
    # Clean up original if different from output
    if input_path != output_path and input_path.exists():
        input_path.unlink()
    return output_path


def to_relative_path(abs_path: Path) -> str:
    """Convert absolute path to relative path from BACKEND_ROOT for URL serving."""
    try:
        return str(abs_path.relative_to(BACKEND_ROOT))
    except ValueError:
        # Fallback: just use storage/... format
        return str(abs_path)

EMOTION_CATEGORIES = Literal["neutral", "happy", "sad", "tense", "angry", "whisper"]

EMOTION_TEXTS = {
    "neutral": (
        "A szobában csend volt. Az ablakon átszűrődő fény lassan kúszott végig a padlón, "
        "és minden úgy állt, ahogy előző este hagyta. Felállt, kinyitotta az ablakot, és hideg "
        "levegő áramlott be. Valahol a város mélyén autó dudált, aztán megint csend lett."
    ),
    "happy": (
        "Végre megérkeztek! Azt hitte, ez a nap soha nem jön el, mégis itt álltak, ragyogó "
        "arccal, tele nevetéssel és izgalommal. Átölelte mindkettőjüket egyszerre, és érezte, "
        "hogy a szíve majd kiugrik a helyéről. Ilyen jó volt újra együtt lenni."
    ),
    "sad": (
        "Nem értette, hogyan lehet valaki egyszerre ilyen közel és ilyen messze. A levelek ott "
        "hevertek az asztalon, olvasatlanul. Már nem tudta, mit írna vissza — vagy hogy egyáltalán "
        "érdemes-e. Kinézett az ablakon, és hosszan figyelte az esőt."
    ),
    "tense": (
        "Valaki a folyosón volt. A lélegzetét visszafojtva figyelt — egy lépés, aztán csend. "
        "Aztán megint egy lépés, közelebb. A kilincs lassan, zajtalanul mozdult meg. Nem mert "
        "felállni, nem mert megszólalni. Csak várt, és a szíve vadul vert."
    ),
    "angry": (
        "Elege lett. Minden egyes alkalommal ugyanez történt, és most már nem volt hajlandó szó "
        "nélkül elmenni mellette. Megfordult, és egyenesen a szemébe nézett. — Tudod mit? Most "
        "már tényleg mindegy. Csináld, amit akarsz — mondta, és becsapta maga mögött az ajtót."
    ),
    "whisper": (
        "Hallod? — suttogta, és közelebb hajolt. — Ne mondd senkinek. Ez csak közöttünk marad, "
        "rendben? — Keze remegett, ahogy a papírt átnyújtotta. — Ha megtudják, hogy itt voltam, "
        "mindennek vége. Figyelj rám: senkinek egy szót se."
    ),
}

router = APIRouter(prefix="/api/voices", tags=["voices"])


@router.post("", response_model=VoiceOut, status_code=201)
async def create_voice(voice: VoiceCreate, db: AsyncSession = Depends(get_db)):
    db_voice = Voice(**voice.model_dump())
    db.add(db_voice)
    await db.commit()
    await db.refresh(db_voice)
    return db_voice


@router.get("", response_model=list[VoiceOut])
async def list_voices(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Voice).order_by(Voice.created_at.desc()))
    return result.scalars().all()


@router.get("/emotion-texts")
async def get_emotion_texts():
    """Return the prewritten texts for each emotion category."""
    return EMOTION_TEXTS


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

    # Validate file extension
    filename = file.filename or "clip.wav"
    ext = Path(filename).suffix.lower()
    if ext not in ALLOWED_AUDIO_EXTENSIONS:
        raise HTTPException(400, f"Unsupported format. Allowed: {', '.join(ALLOWED_AUDIO_EXTENSIONS)}")

    # Ensure voices directory exists
    settings.voices_path.mkdir(parents=True, exist_ok=True)

    # Save uploaded file with original extension
    upload_path = settings.voices_path / f"voice_{voice_id}_upload{ext}"
    with open(upload_path, "wb") as f:
        shutil.copyfileobj(file.file, f)

    # Convert to WAV if needed (XTTS-v2 requires 22050Hz mono WAV)
    clip_path = settings.voices_path / f"voice_{voice_id}_ref.wav"
    if ext == ".wav":
        # Still normalize to 22050Hz mono
        convert_to_wav(upload_path, clip_path)
    else:
        convert_to_wav(upload_path, clip_path)

    voice.reference_clip_path = to_relative_path(clip_path)
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


@router.post("/{voice_id}/emotion-clips/{emotion}", response_model=VoiceOut)
async def upload_emotion_clip(
    voice_id: int,
    emotion: EMOTION_CATEGORIES,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
):
    """Upload an audio clip for a specific emotion category."""
    result = await db.execute(select(Voice).where(Voice.id == voice_id))
    voice = result.scalar_one_or_none()
    if not voice:
        raise HTTPException(404, "Voice not found")

    filename = file.filename or "clip.wav"
    ext = Path(filename).suffix.lower()
    if ext not in ALLOWED_AUDIO_EXTENSIONS:
        raise HTTPException(400, f"Unsupported format. Allowed: {', '.join(ALLOWED_AUDIO_EXTENSIONS)}")

    settings.voices_path.mkdir(parents=True, exist_ok=True)
    upload_path = settings.voices_path / f"voice_{voice_id}_emo_{emotion}_upload{ext}"
    with open(upload_path, "wb") as f:
        shutil.copyfileobj(file.file, f)

    clip_path = settings.voices_path / f"voice_{voice_id}_emo_{emotion}.wav"
    convert_to_wav(upload_path, clip_path)

    bank = json.loads(voice.emotion_bank) if voice.emotion_bank else {}
    bank[emotion] = to_relative_path(clip_path)
    voice.emotion_bank = json.dumps(bank)

    await db.commit()
    await db.refresh(voice)
    return voice


@router.delete("/{voice_id}/emotion-clips/{emotion}", response_model=VoiceOut)
async def delete_emotion_clip(
    voice_id: int,
    emotion: EMOTION_CATEGORIES,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Voice).where(Voice.id == voice_id))
    voice = result.scalar_one_or_none()
    if not voice:
        raise HTTPException(404, "Voice not found")

    if voice.emotion_bank:
        bank = json.loads(voice.emotion_bank)
        clip_rel = bank.pop(emotion, None)
        voice.emotion_bank = json.dumps(bank)
        await db.commit()
        if clip_rel:
            clip_path = BACKEND_ROOT / clip_rel
            if clip_path.exists():
                clip_path.unlink()

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
