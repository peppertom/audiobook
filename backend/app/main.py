from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from app.database import init_db
from app.config import settings
from app.routers import books, voices, jobs, playback, users, auth_routes, reading

# Ensure storage directories exist before StaticFiles mount
for path in [settings.storage_path, settings.books_path, settings.audio_path, settings.voices_path]:
    path.mkdir(parents=True, exist_ok=True)


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    yield


app = FastAPI(title="Audiobook", lifespan=lifespan, redirect_slashes=False)

cors_origins = [o.strip() for o in settings.cors_origins.split(",") if o.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"] if "*" in cors_origins else cors_origins,
    allow_credentials="*" not in cors_origins,  # credentials incompatible with wildcard
    allow_methods=["*"],
    allow_headers=["*"],
)

app.mount("/storage", StaticFiles(directory=str(settings.storage_path)), name="storage")

app.include_router(books.router)
app.include_router(voices.router)
app.include_router(jobs.router)
app.include_router(playback.router)
app.include_router(users.router)
app.include_router(auth_routes.router)
app.include_router(reading.router)


@app.get("/health")
async def health():
    return {"status": "ok"}
