from datetime import datetime
from pydantic import BaseModel


# --- Books ---
class BookCreate(BaseModel):
    title: str
    author: str = "Unknown"
    language: str = "hu"


class ChapterOut(BaseModel):
    id: int
    chapter_number: int
    title: str
    word_count: int
    model_config = {"from_attributes": True}


class BookOut(BaseModel):
    id: int
    title: str
    author: str
    language: str
    original_filename: str
    chapter_count: int
    created_at: datetime
    model_config = {"from_attributes": True}


class BookDetailOut(BookOut):
    chapters: list[ChapterOut] = []


# --- Voices ---
class VoiceCreate(BaseModel):
    name: str
    description: str = ""
    language: str = "hu"
    source: str = "upload"


class VoiceOut(BaseModel):
    id: int
    name: str
    description: str
    language: str
    sample_audio_path: str | None
    reference_clip_path: str | None
    source: str
    created_at: datetime
    model_config = {"from_attributes": True}


# --- Jobs ---
class JobCreate(BaseModel):
    chapter_id: int
    voice_id: int


class JobOut(BaseModel):
    id: int
    chapter_id: int
    voice_id: int
    status: str
    audio_output_path: str | None
    duration_seconds: float | None
    timing_data: str | None = None  # JSON string: [{start, end, text}, ...]
    error_message: str | None
    created_at: datetime
    completed_at: datetime | None
    model_config = {"from_attributes": True}


class JobDetailOut(JobOut):
    chapter_title: str = ""
    chapter_number: int = 0
    book_title: str = ""
    voice_name: str = ""


# --- Playback ---
class PlaybackStateUpdate(BaseModel):
    book_id: int
    voice_id: int
    current_chapter_id: int
    position_seconds: float


class PlaybackStateOut(BaseModel):
    id: int
    book_id: int
    voice_id: int
    current_chapter_id: int
    position_seconds: float
    updated_at: datetime
    model_config = {"from_attributes": True}
