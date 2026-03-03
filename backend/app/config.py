from pathlib import Path
from pydantic_settings import BaseSettings

# In Docker: /app/app/config.py -> parent.parent = /app (WORKDIR)
# Locally: backend/app/config.py -> parent.parent = backend/
BACKEND_ROOT = Path(__file__).parent.parent.resolve()


class Settings(BaseSettings):
    database_url: str = f"sqlite+aiosqlite:///{BACKEND_ROOT}/storage/audiobook.db"
    storage_path: Path = BACKEND_ROOT / "storage"
    books_path: Path = BACKEND_ROOT / "storage" / "books"
    audio_path: Path = BACKEND_ROOT / "storage" / "audio"
    voices_path: Path = BACKEND_ROOT / "storage" / "voices"
    redis_url: str = "redis://localhost:6379"

    model_config = {"env_prefix": "AUDIOBOOK_"}


settings = Settings()
