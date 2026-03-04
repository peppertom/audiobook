import uuid
from datetime import datetime
from sqlalchemy import String, Integer, Text, Float, ForeignKey, DateTime, Boolean, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base


# --- User & Auth ---

class User(Base):
    __tablename__ = "users"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    email: Mapped[str] = mapped_column(String(500), unique=True, nullable=False, index=True)
    password_hash: Mapped[str | None] = mapped_column(String(200), nullable=True)
    name: Mapped[str | None] = mapped_column(String(500), nullable=True)
    avatar_url: Mapped[str | None] = mapped_column(String(1000), nullable=True)
    locale: Mapped[str] = mapped_column(String(5), default="en")
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now())

    settings: Mapped["UserSettings"] = relationship(back_populates="user", uselist=False, cascade="all, delete-orphan")
    credit_balance: Mapped["CreditBalance"] = relationship(back_populates="user", uselist=False, cascade="all, delete-orphan")
    credit_transactions: Mapped[list["CreditTransaction"]] = relationship(back_populates="user", cascade="all, delete-orphan")


class UserSettings(Base):
    __tablename__ = "user_settings"
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id", ondelete="CASCADE"), unique=True)
    playback_speed: Mapped[float] = mapped_column(Float, default=1.0)
    audio_quality: Mapped[str] = mapped_column(String(20), default="standard")
    email_notifications: Mapped[bool] = mapped_column(Boolean, default=True)
    theme: Mapped[str] = mapped_column(String(20), default="system")
    ui_language: Mapped[str] = mapped_column(String(5), default="en")
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now())

    user: Mapped["User"] = relationship(back_populates="settings")


class CreditBalance(Base):
    __tablename__ = "credit_balances"
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id", ondelete="CASCADE"), unique=True)
    balance: Mapped[int] = mapped_column(Integer, default=0)
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now())

    user: Mapped["User"] = relationship(back_populates="credit_balance")


class CreditTransaction(Base):
    __tablename__ = "credit_transactions"
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id", ondelete="CASCADE"))
    amount: Mapped[int] = mapped_column(Integer)  # positive = grant, negative = spend
    type: Mapped[str] = mapped_column(String(50))  # subscription_grant|purchase|conversion_spend|refund|signup_bonus
    description: Mapped[str | None] = mapped_column(String(500), nullable=True)
    reference_id: Mapped[str | None] = mapped_column(String(200), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    user: Mapped["User"] = relationship(back_populates="credit_transactions")


# --- Books ---

class Book(Base):
    __tablename__ = "books"
    id: Mapped[int] = mapped_column(primary_key=True)
    title: Mapped[str] = mapped_column(String(500))
    author: Mapped[str] = mapped_column(String(500), default="Unknown")
    language: Mapped[str] = mapped_column(String(10), default="hu")
    original_filename: Mapped[str] = mapped_column(String(500))
    chapter_count: Mapped[int] = mapped_column(Integer, default=0)
    user_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    chapters: Mapped[list["Chapter"]] = relationship(back_populates="book", cascade="all, delete-orphan")


class Chapter(Base):
    __tablename__ = "chapters"
    id: Mapped[int] = mapped_column(primary_key=True)
    book_id: Mapped[int] = mapped_column(ForeignKey("books.id", ondelete="CASCADE"))
    chapter_number: Mapped[int] = mapped_column(Integer)
    title: Mapped[str] = mapped_column(String(500), default="")
    text_content: Mapped[str] = mapped_column(Text)
    word_count: Mapped[int] = mapped_column(Integer, default=0)
    book: Mapped["Book"] = relationship(back_populates="chapters")


class Voice(Base):
    __tablename__ = "voices"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(200))
    description: Mapped[str] = mapped_column(String(1000), default="")
    language: Mapped[str] = mapped_column(String(10), default="hu")
    sample_audio_path: Mapped[str | None] = mapped_column(String(500), nullable=True)
    reference_clip_path: Mapped[str | None] = mapped_column(String(500), nullable=True)
    source: Mapped[str] = mapped_column(String(50), default="upload")  # youtube|upload|preset
    user_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    is_public: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())


class Job(Base):
    __tablename__ = "jobs"
    id: Mapped[int] = mapped_column(primary_key=True)
    chapter_id: Mapped[int] = mapped_column(ForeignKey("chapters.id", ondelete="CASCADE"))
    voice_id: Mapped[int] = mapped_column(ForeignKey("voices.id", ondelete="CASCADE"))
    status: Mapped[str] = mapped_column(String(20), default="queued")  # queued|processing|done|failed
    audio_output_path: Mapped[str | None] = mapped_column(String(500), nullable=True)
    duration_seconds: Mapped[float | None] = mapped_column(Float, nullable=True)
    timing_data: Mapped[str | None] = mapped_column(Text, nullable=True)  # JSON: [{start, end, text}, ...]
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    user_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    completed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    chapter: Mapped["Chapter"] = relationship()
    voice: Mapped["Voice"] = relationship()


class PlaybackState(Base):
    __tablename__ = "playback_state"
    id: Mapped[int] = mapped_column(primary_key=True)
    book_id: Mapped[int] = mapped_column(ForeignKey("books.id", ondelete="CASCADE"))
    voice_id: Mapped[int] = mapped_column(ForeignKey("voices.id", ondelete="CASCADE"))
    current_chapter_id: Mapped[int] = mapped_column(ForeignKey("chapters.id"))
    position_seconds: Mapped[float] = mapped_column(Float, default=0.0)
    user_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now())
