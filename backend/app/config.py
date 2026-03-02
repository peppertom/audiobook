from pathlib import Path
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    database_url: str = "sqlite+aiosqlite:///./storage/audiobook.db"
    storage_path: Path = Path("./storage")
    books_path: Path = Path("./storage/books")
    audio_path: Path = Path("./storage/audio")
    voices_path: Path = Path("./storage/voices")
    redis_url: str = "redis://localhost:6379"

    model_config = {"env_prefix": "AUDIOBOOK_"}


settings = Settings()
