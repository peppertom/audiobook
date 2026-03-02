from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from app.database import init_db
from app.config import settings
from app.routers import books


@asynccontextmanager
async def lifespan(app: FastAPI):
    for path in [settings.books_path, settings.audio_path, settings.voices_path]:
        path.mkdir(parents=True, exist_ok=True)
    await init_db()
    yield


app = FastAPI(title="Audiobook", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.mount("/storage", StaticFiles(directory=str(settings.storage_path)), name="storage")

app.include_router(books.router)


@app.get("/health")
async def health():
    return {"status": "ok"}
