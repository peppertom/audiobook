from datetime import datetime
from pydantic import BaseModel, EmailStr


# --- Auth ---
class RegisterRequest(BaseModel):
    email: str
    password: str
    name: str | None = None


class LoginRequest(BaseModel):
    email: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: "UserResponse"


# --- Users ---
class UserResponse(BaseModel):
    id: str
    email: str
    name: str | None
    avatar_url: str | None
    locale: str
    created_at: datetime
    model_config = {"from_attributes": True}


class UserSettingsResponse(BaseModel):
    playback_speed: float
    audio_quality: str
    email_notifications: bool
    theme: str
    ui_language: str
    model_config = {"from_attributes": True}


class UserSettingsUpdate(BaseModel):
    playback_speed: float | None = None
    audio_quality: str | None = None
    email_notifications: bool | None = None
    theme: str | None = None
    ui_language: str | None = None


class CreditBalanceResponse(BaseModel):
    balance: int
    model_config = {"from_attributes": True}


class CreditTransactionResponse(BaseModel):
    id: int
    amount: int
    type: str
    description: str | None
    reference_id: str | None
    created_at: datetime
    model_config = {"from_attributes": True}


class CostEstimateResponse(BaseModel):
    total_words: int
    credits_required: int
    estimated_cost_usd: float
    current_balance: int
    sufficient_credits: bool


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
