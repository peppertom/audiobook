from pathlib import Path
from pydantic_settings import BaseSettings

# In Docker: /app/app/config.py -> parent.parent = /app (WORKDIR)
# Locally: backend/app/config.py -> parent.parent = backend/
BACKEND_ROOT = Path(__file__).parent.parent.resolve()


class Settings(BaseSettings):
    database_url: str = "postgresql+asyncpg://audiobook:audiobook_dev@localhost:5433/audiobook"
    storage_path: Path = BACKEND_ROOT / "storage"
    books_path: Path = BACKEND_ROOT / "storage" / "books"
    audio_path: Path = BACKEND_ROOT / "storage" / "audio"
    voices_path: Path = BACKEND_ROOT / "storage" / "voices"
    redis_url: str = "redis://localhost:6379"
    jwt_secret: str = "dev-secret-change-in-production"
    jwt_algorithm: str = "HS256"
    free_signup_credits: int = 3
    cors_origins: str = "http://localhost:3000,http://127.0.0.1:3000"
    ollama_url: str = "http://localhost:11434"
    ollama_model: str = "qwen2.5-coder:14b"

    model_config = {"env_prefix": "AUDIOBOOK_"}


settings = Settings()
