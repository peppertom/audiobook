# Audiobook App Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a local-first audiobook web app where users upload EPUB books and listen to them read by custom cloned voices using XTTS-v2.

**Architecture:** Next.js frontend + Python FastAPI backend + ARQ/Redis job queue + XTTS-v2 TTS worker. Single-user, local-first. Worker runs natively on M1 Mac for MPS GPU access; everything else in Docker.

**Tech Stack:** Next.js 14 (App Router, TypeScript, Tailwind), FastAPI, SQLAlchemy (async + SQLite), ARQ, Redis, XTTS-v2, ebooklib, yt-dlp, demucs, ffmpeg

---

## Project Structure

```
audiobook/
├── frontend/                    # Next.js app
│   ├── src/
│   │   ├── app/
│   │   │   ├── layout.tsx
│   │   │   ├── page.tsx                  # Library (home)
│   │   │   ├── books/[id]/page.tsx       # Book detail
│   │   │   ├── voices/page.tsx           # Voice management
│   │   │   └── queue/page.tsx            # Job queue
│   │   ├── components/
│   │   │   ├── BookCard.tsx
│   │   │   ├── Player.tsx
│   │   │   ├── VoiceSelector.tsx
│   │   │   ├── FileUpload.tsx
│   │   │   └── WaveformTrimmer.tsx
│   │   └── lib/
│   │       └── api.ts                    # API client
│   ├── package.json
│   ├── tailwind.config.ts
│   └── next.config.ts
├── backend/
│   ├── app/
│   │   ├── __init__.py
│   │   ├── main.py                       # FastAPI app
│   │   ├── config.py                     # Settings
│   │   ├── database.py                   # SQLAlchemy setup
│   │   ├── models.py                     # ORM models
│   │   ├── schemas.py                    # Pydantic schemas
│   │   ├── routers/
│   │   │   ├── __init__.py
│   │   │   ├── books.py
│   │   │   ├── voices.py
│   │   │   ├── jobs.py
│   │   │   └── playback.py
│   │   ├── services/
│   │   │   ├── __init__.py
│   │   │   ├── epub_parser.py
│   │   │   ├── voice_pipeline.py
│   │   │   └── tts_engine.py
│   │   └── worker.py                     # ARQ worker entrypoint
│   ├── tests/
│   │   ├── __init__.py
│   │   ├── conftest.py
│   │   ├── test_epub_parser.py
│   │   ├── test_books_api.py
│   │   ├── test_voices_api.py
│   │   ├── test_jobs_api.py
│   │   └── fixtures/
│   │       └── test_book.epub            # Test EPUB fixture
│   ├── requirements.txt
│   └── Dockerfile
├── storage/                              # Runtime file storage
│   ├── books/
│   ├── audio/
│   └── voices/
├── docker-compose.yml
└── docs/plans/
```

---

## Task 1: Backend Project Scaffolding

**Files:**
- Create: `backend/requirements.txt`
- Create: `backend/app/__init__.py`
- Create: `backend/app/config.py`
- Create: `backend/app/main.py`
- Create: `backend/app/database.py`
- Create: `backend/tests/__init__.py`
- Create: `backend/tests/conftest.py`

**Step 1: Create requirements.txt**

```txt
fastapi==0.115.6
uvicorn[standard]==0.34.0
sqlalchemy[asyncio]==2.0.36
aiosqlite==0.20.0
python-multipart==0.0.20
ebooklib==0.18
beautifulsoup4==4.12.3
lxml==5.3.0
arq==0.26.1
pydantic==2.10.3
pydantic-settings==2.7.0
yt-dlp==2024.12.23
httpx==0.28.1
pytest==8.3.4
pytest-asyncio==0.24.0
```

**Step 2: Create config.py**

```python
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
```

**Step 3: Create database.py**

```python
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy.orm import DeclarativeBase
from app.config import settings

engine = create_async_engine(settings.database_url, echo=False)
async_session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

class Base(DeclarativeBase):
    pass

async def get_db():
    async with async_session() as session:
        try:
            yield session
        finally:
            await session.close()

async def init_db():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
```

**Step 4: Create main.py**

```python
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from app.database import init_db
from app.config import settings

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

@app.get("/health")
async def health():
    return {"status": "ok"}
```

**Step 5: Create conftest.py**

```python
import pytest
import pytest_asyncio
from httpx import AsyncClient, ASGITransport
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from app.database import Base, get_db
from app.main import app

TEST_DB_URL = "sqlite+aiosqlite://"

@pytest_asyncio.fixture
async def db_session():
    engine = create_async_engine(TEST_DB_URL, echo=False)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    session_maker = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with session_maker() as session:
        yield session
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
    await engine.dispose()

@pytest_asyncio.fixture
async def client(db_session):
    async def override_get_db():
        yield db_session
    app.dependency_overrides[get_db] = override_get_db
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        yield c
    app.dependency_overrides.clear()
```

**Step 6: Create empty __init__.py files**

Empty files for `backend/app/__init__.py` and `backend/tests/__init__.py`.

**Step 7: Verify backend starts**

```bash
cd backend && pip install -r requirements.txt
cd backend && python -m pytest tests/ -v
cd backend && uvicorn app.main:app --reload --port 8000
# GET http://localhost:8000/health → {"status": "ok"}
```

**Step 8: Commit**

```bash
git add backend/
git commit -m "feat: backend scaffolding with FastAPI, SQLAlchemy, pytest"
```

---

## Task 2: Database Models & Schemas

**Files:**
- Create: `backend/app/models.py`
- Create: `backend/app/schemas.py`
- Create: `backend/app/routers/__init__.py`

**Step 1: Write model tests**

Create `backend/tests/test_models.py`:

```python
import pytest
from sqlalchemy import select
from app.models import Book, Chapter, Voice, Job, PlaybackState

@pytest.mark.asyncio
async def test_create_book(db_session):
    book = Book(title="Test Book", author="Author", language="hu", original_filename="test.epub", chapter_count=3)
    db_session.add(book)
    await db_session.commit()
    result = await db_session.execute(select(Book))
    saved = result.scalar_one()
    assert saved.title == "Test Book"
    assert saved.id is not None

@pytest.mark.asyncio
async def test_book_chapter_relationship(db_session):
    book = Book(title="Test", author="A", language="hu", original_filename="t.epub", chapter_count=1)
    db_session.add(book)
    await db_session.commit()
    chapter = Chapter(book_id=book.id, chapter_number=1, title="Ch 1", text_content="Hello", word_count=1)
    db_session.add(chapter)
    await db_session.commit()
    result = await db_session.execute(select(Chapter).where(Chapter.book_id == book.id))
    saved = result.scalar_one()
    assert saved.title == "Ch 1"
```

**Step 2: Run tests to verify they fail**

```bash
cd backend && python -m pytest tests/test_models.py -v
# Expected: FAIL — models not defined
```

**Step 3: Implement models.py**

```python
from datetime import datetime
from sqlalchemy import String, Integer, Text, Float, ForeignKey, DateTime, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base

class Book(Base):
    __tablename__ = "books"
    id: Mapped[int] = mapped_column(primary_key=True)
    title: Mapped[str] = mapped_column(String(500))
    author: Mapped[str] = mapped_column(String(500), default="Unknown")
    language: Mapped[str] = mapped_column(String(10), default="hu")
    original_filename: Mapped[str] = mapped_column(String(500))
    chapter_count: Mapped[int] = mapped_column(Integer, default=0)
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
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

class Job(Base):
    __tablename__ = "jobs"
    id: Mapped[int] = mapped_column(primary_key=True)
    chapter_id: Mapped[int] = mapped_column(ForeignKey("chapters.id", ondelete="CASCADE"))
    voice_id: Mapped[int] = mapped_column(ForeignKey("voices.id", ondelete="CASCADE"))
    status: Mapped[str] = mapped_column(String(20), default="queued")  # queued|processing|done|failed
    audio_output_path: Mapped[str | None] = mapped_column(String(500), nullable=True)
    duration_seconds: Mapped[float | None] = mapped_column(Float, nullable=True)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
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
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now())
```

**Step 4: Implement schemas.py**

```python
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
    error_message: str | None
    created_at: datetime
    completed_at: datetime | None
    model_config = {"from_attributes": True}

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
```

**Step 5: Run tests to verify they pass**

```bash
cd backend && python -m pytest tests/test_models.py -v
# Expected: PASS
```

**Step 6: Commit**

```bash
git add backend/app/models.py backend/app/schemas.py backend/app/routers/__init__.py backend/tests/test_models.py
git commit -m "feat: database models and Pydantic schemas"
```

---

## Task 3: EPUB Parser Service (TDD)

**Files:**
- Create: `backend/app/services/__init__.py`
- Create: `backend/app/services/epub_parser.py`
- Create: `backend/tests/test_epub_parser.py`
- Create: `backend/tests/fixtures/test_book.epub` (generated programmatically in test setup)

**Step 1: Write failing tests**

```python
import pytest
from pathlib import Path
from ebooklib import epub
from app.services.epub_parser import parse_epub

def create_test_epub(path: Path) -> Path:
    """Create a minimal test EPUB file."""
    book = epub.EpubBook()
    book.set_identifier("test-book-001")
    book.set_title("Test Book Title")
    book.set_language("hu")
    book.add_author("Test Author")

    ch1 = epub.EpubHtml(title="Chapter 1", file_name="ch1.xhtml", lang="hu")
    ch1.content = "<html><body><h1>Chapter 1</h1><p>This is the first chapter content.</p></body></html>"
    book.add_item(ch1)

    ch2 = epub.EpubHtml(title="Chapter 2", file_name="ch2.xhtml", lang="hu")
    ch2.content = "<html><body><h1>Chapter 2</h1><p>This is the second chapter content.</p></body></html>"
    book.add_item(ch2)

    book.toc = [epub.Link("ch1.xhtml", "Chapter 1", "ch1"), epub.Link("ch2.xhtml", "Chapter 2", "ch2")]
    book.add_item(epub.EpubNcx())
    book.add_item(epub.EpubNav())
    book.spine = ["nav", ch1, ch2]

    epub_path = path / "test_book.epub"
    epub.write_epub(str(epub_path), book)
    return epub_path

def test_parse_epub_metadata(tmp_path):
    epub_path = create_test_epub(tmp_path)
    result = parse_epub(epub_path)
    assert result["title"] == "Test Book Title"
    assert result["author"] == "Test Author"
    assert result["language"] == "hu"

def test_parse_epub_chapters(tmp_path):
    epub_path = create_test_epub(tmp_path)
    result = parse_epub(epub_path)
    assert len(result["chapters"]) == 2
    assert result["chapters"][0]["title"] == "Chapter 1"
    assert "first chapter content" in result["chapters"][0]["text"]
    assert result["chapters"][0]["word_count"] > 0

def test_parse_epub_strips_html(tmp_path):
    epub_path = create_test_epub(tmp_path)
    result = parse_epub(epub_path)
    text = result["chapters"][0]["text"]
    assert "<" not in text
    assert ">" not in text
```

**Step 2: Run tests to verify they fail**

```bash
cd backend && python -m pytest tests/test_epub_parser.py -v
# Expected: FAIL — module not found
```

**Step 3: Implement epub_parser.py**

```python
from pathlib import Path
from ebooklib import epub
import ebooklib
from bs4 import BeautifulSoup

def parse_epub(file_path: Path) -> dict:
    """Parse an EPUB file, extract metadata and chapters with plain text."""
    book = epub.read_epub(str(file_path))

    # Extract metadata
    title = book.get_metadata("DC", "title")
    title = title[0][0] if title else "Unknown Title"
    creator = book.get_metadata("DC", "creator")
    author = creator[0][0] if creator else "Unknown"
    language = book.get_metadata("DC", "language")
    language = language[0][0] if language else "hu"

    # Extract chapters from spine order
    chapters = []
    chapter_num = 0
    for item in book.get_items_of_type(ebooklib.ITEM_DOCUMENT):
        content = item.get_content().decode("utf-8", errors="replace")
        soup = BeautifulSoup(content, "lxml")
        text = soup.get_text(separator=" ", strip=True)

        if len(text.strip()) < 10:
            continue  # Skip near-empty pages (cover, copyright, etc.)

        chapter_num += 1
        # Try to find a heading for the chapter title
        heading = soup.find(["h1", "h2", "h3"])
        ch_title = heading.get_text(strip=True) if heading else f"Chapter {chapter_num}"

        chapters.append({
            "chapter_number": chapter_num,
            "title": ch_title,
            "text": text,
            "word_count": len(text.split()),
        })

    return {
        "title": title,
        "author": author,
        "language": language,
        "chapters": chapters,
    }
```

**Step 4: Run tests to verify they pass**

```bash
cd backend && python -m pytest tests/test_epub_parser.py -v
# Expected: PASS
```

**Step 5: Commit**

```bash
git add backend/app/services/ backend/tests/test_epub_parser.py
git commit -m "feat: EPUB parser with chapter extraction and HTML stripping"
```

---

## Task 4: Book Upload API (TDD)

**Files:**
- Create: `backend/app/routers/books.py`
- Create: `backend/tests/test_books_api.py`
- Modify: `backend/app/main.py` (add router)

**Step 1: Write failing tests**

```python
import pytest
from io import BytesIO
from pathlib import Path
from ebooklib import epub

def create_test_epub_bytes() -> bytes:
    """Create a test EPUB and return as bytes."""
    book = epub.EpubBook()
    book.set_identifier("test-001")
    book.set_title("Upload Test")
    book.set_language("hu")
    book.add_author("Tester")
    ch1 = epub.EpubHtml(title="Ch 1", file_name="ch1.xhtml", lang="hu")
    ch1.content = "<html><body><h1>Chapter 1</h1><p>Content here.</p></body></html>"
    book.add_item(ch1)
    book.toc = [epub.Link("ch1.xhtml", "Ch 1", "ch1")]
    book.add_item(epub.EpubNcx())
    book.add_item(epub.EpubNav())
    book.spine = ["nav", ch1]
    # Write to a temporary file and read bytes
    import tempfile, os
    fd, path = tempfile.mkstemp(suffix=".epub")
    epub.write_epub(path, book)
    with open(path, "rb") as f:
        data = f.read()
    os.unlink(path)
    return data

@pytest.mark.asyncio
async def test_upload_book(client, tmp_path):
    epub_bytes = create_test_epub_bytes()
    response = await client.post(
        "/api/books/upload",
        files={"file": ("test.epub", BytesIO(epub_bytes), "application/epub+zip")},
    )
    assert response.status_code == 201
    data = response.json()
    assert data["title"] == "Upload Test"
    assert data["author"] == "Tester"
    assert data["chapter_count"] >= 1

@pytest.mark.asyncio
async def test_list_books(client, tmp_path):
    # Upload a book first
    epub_bytes = create_test_epub_bytes()
    await client.post("/api/books/upload", files={"file": ("test.epub", BytesIO(epub_bytes), "application/epub+zip")})
    response = await client.get("/api/books/")
    assert response.status_code == 200
    data = response.json()
    assert len(data) >= 1

@pytest.mark.asyncio
async def test_get_book_detail(client, tmp_path):
    epub_bytes = create_test_epub_bytes()
    upload = await client.post("/api/books/upload", files={"file": ("test.epub", BytesIO(epub_bytes), "application/epub+zip")})
    book_id = upload.json()["id"]
    response = await client.get(f"/api/books/{book_id}")
    assert response.status_code == 200
    data = response.json()
    assert "chapters" in data
    assert len(data["chapters"]) >= 1

@pytest.mark.asyncio
async def test_delete_book(client, tmp_path):
    epub_bytes = create_test_epub_bytes()
    upload = await client.post("/api/books/upload", files={"file": ("test.epub", BytesIO(epub_bytes), "application/epub+zip")})
    book_id = upload.json()["id"]
    response = await client.delete(f"/api/books/{book_id}")
    assert response.status_code == 204
```

**Step 2: Run tests to verify they fail**

```bash
cd backend && python -m pytest tests/test_books_api.py -v
# Expected: FAIL — 404
```

**Step 3: Implement books router**

```python
import shutil
from pathlib import Path
from fastapi import APIRouter, Depends, UploadFile, File, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from app.database import get_db
from app.config import settings
from app.models import Book, Chapter
from app.schemas import BookOut, BookDetailOut
from app.services.epub_parser import parse_epub

router = APIRouter(prefix="/api/books", tags=["books"])

@router.post("/upload", response_model=BookOut, status_code=201)
async def upload_book(file: UploadFile = File(...), db: AsyncSession = Depends(get_db)):
    if not file.filename or not file.filename.endswith(".epub"):
        raise HTTPException(400, "Only EPUB files are supported")

    # Save uploaded file
    file_path = settings.books_path / file.filename
    with open(file_path, "wb") as f:
        shutil.copyfileobj(file.file, f)

    # Parse EPUB
    parsed = parse_epub(file_path)

    # Create book record
    book = Book(
        title=parsed["title"],
        author=parsed["author"],
        language=parsed["language"],
        original_filename=file.filename,
        chapter_count=len(parsed["chapters"]),
    )
    db.add(book)
    await db.flush()

    # Create chapter records
    for ch in parsed["chapters"]:
        chapter = Chapter(
            book_id=book.id,
            chapter_number=ch["chapter_number"],
            title=ch["title"],
            text_content=ch["text"],
            word_count=ch["word_count"],
        )
        db.add(chapter)

    await db.commit()
    await db.refresh(book)
    return book

@router.get("/", response_model=list[BookOut])
async def list_books(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Book).order_by(Book.created_at.desc()))
    return result.scalars().all()

@router.get("/{book_id}", response_model=BookDetailOut)
async def get_book(book_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Book).where(Book.id == book_id).options(selectinload(Book.chapters))
    )
    book = result.scalar_one_or_none()
    if not book:
        raise HTTPException(404, "Book not found")
    return book

@router.delete("/{book_id}", status_code=204)
async def delete_book(book_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Book).where(Book.id == book_id))
    book = result.scalar_one_or_none()
    if not book:
        raise HTTPException(404, "Book not found")
    # Delete stored file
    file_path = settings.books_path / book.original_filename
    if file_path.exists():
        file_path.unlink()
    await db.delete(book)
    await db.commit()
```

**Step 4: Register router in main.py**

Add to `backend/app/main.py`:
```python
from app.routers import books
app.include_router(books.router)
```

**Step 5: Run tests**

```bash
cd backend && python -m pytest tests/test_books_api.py -v
# Expected: PASS
```

**Step 6: Commit**

```bash
git add backend/
git commit -m "feat: book upload, list, detail, and delete API"
```

---

## Task 5: Voice Management API (TDD)

**Files:**
- Create: `backend/app/routers/voices.py`
- Create: `backend/tests/test_voices_api.py`
- Modify: `backend/app/main.py` (add router)

**Step 1: Write failing tests**

```python
import pytest

@pytest.mark.asyncio
async def test_create_voice(client):
    response = await client.post("/api/voices/", json={
        "name": "Test Voice", "description": "A test", "language": "hu", "source": "upload"
    })
    assert response.status_code == 201
    assert response.json()["name"] == "Test Voice"

@pytest.mark.asyncio
async def test_list_voices(client):
    await client.post("/api/voices/", json={"name": "V1", "language": "hu", "source": "upload"})
    response = await client.get("/api/voices/")
    assert response.status_code == 200
    assert len(response.json()) >= 1

@pytest.mark.asyncio
async def test_upload_reference_clip(client, tmp_path):
    # Create a voice first
    create = await client.post("/api/voices/", json={"name": "Clip Voice", "language": "hu", "source": "upload"})
    voice_id = create.json()["id"]
    # Upload a fake WAV file as reference clip
    fake_wav = b"RIFF" + b"\x00" * 100  # minimal fake header
    response = await client.post(
        f"/api/voices/{voice_id}/reference-clip",
        files={"file": ("clip.wav", fake_wav, "audio/wav")},
    )
    assert response.status_code == 200
    assert response.json()["reference_clip_path"] is not None

@pytest.mark.asyncio
async def test_delete_voice(client):
    create = await client.post("/api/voices/", json={"name": "Del Voice", "language": "hu", "source": "upload"})
    voice_id = create.json()["id"]
    response = await client.delete(f"/api/voices/{voice_id}")
    assert response.status_code == 204
```

**Step 2: Run tests to verify they fail**

```bash
cd backend && python -m pytest tests/test_voices_api.py -v
```

**Step 3: Implement voices router**

```python
import shutil
from fastapi import APIRouter, Depends, UploadFile, File, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import get_db
from app.config import settings
from app.models import Voice
from app.schemas import VoiceCreate, VoiceOut

router = APIRouter(prefix="/api/voices", tags=["voices"])

@router.post("/", response_model=VoiceOut, status_code=201)
async def create_voice(voice: VoiceCreate, db: AsyncSession = Depends(get_db)):
    db_voice = Voice(**voice.model_dump())
    db.add(db_voice)
    await db.commit()
    await db.refresh(db_voice)
    return db_voice

@router.get("/", response_model=list[VoiceOut])
async def list_voices(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Voice).order_by(Voice.created_at.desc()))
    return result.scalars().all()

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

    clip_path = settings.voices_path / f"voice_{voice_id}_ref.wav"
    with open(clip_path, "wb") as f:
        shutil.copyfileobj(file.file, f)

    voice.reference_clip_path = str(clip_path)
    await db.commit()
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
```

**Step 4: Register router in main.py**

```python
from app.routers import voices
app.include_router(voices.router)
```

**Step 5: Run tests**

```bash
cd backend && python -m pytest tests/test_voices_api.py -v
```

**Step 6: Commit**

```bash
git add backend/
git commit -m "feat: voice CRUD API with reference clip upload"
```

---

## Task 6: Voice Pipeline — YouTube Download & Vocal Isolation

**Files:**
- Create: `backend/app/services/voice_pipeline.py`
- Create: `backend/tests/test_voice_pipeline.py`
- Modify: `backend/app/routers/voices.py` (add YouTube endpoint)

**Step 1: Write unit tests**

```python
import pytest
from unittest.mock import patch, MagicMock
from pathlib import Path
from app.services.voice_pipeline import download_youtube_audio, extract_vocals

def test_download_youtube_audio_calls_ytdlp(tmp_path):
    """Test that yt-dlp is called with correct options."""
    with patch("app.services.voice_pipeline.yt_dlp.YoutubeDL") as mock_ydl:
        instance = MagicMock()
        mock_ydl.return_value.__enter__ = MagicMock(return_value=instance)
        mock_ydl.return_value.__exit__ = MagicMock(return_value=False)
        instance.extract_info.return_value = {"title": "Test Video"}

        # Create a fake output file so the function finds it
        fake_output = tmp_path / "audio.wav"
        fake_output.write_bytes(b"fake audio")

        result = download_youtube_audio("https://youtube.com/watch?v=test", tmp_path)
        instance.extract_info.assert_called_once()
```

**Step 2: Implement voice_pipeline.py**

```python
import subprocess
from pathlib import Path
import yt_dlp

def download_youtube_audio(url: str, output_dir: Path) -> Path:
    """Download audio from a YouTube URL, output as WAV."""
    output_path = output_dir / "audio"
    ydl_opts = {
        "format": "bestaudio/best",
        "outtmpl": str(output_path),
        "postprocessors": [{
            "key": "FFmpegExtractAudio",
            "preferredcodec": "wav",
            "preferredquality": "192",
        }],
        "quiet": True,
    }
    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        ydl.extract_info(url, download=True)

    wav_path = output_path.with_suffix(".wav")
    if not wav_path.exists():
        raise FileNotFoundError(f"Download failed: {wav_path}")
    return wav_path

def extract_vocals(audio_path: Path, output_dir: Path) -> Path:
    """Use demucs to isolate vocals from audio."""
    subprocess.run(
        ["python", "-m", "demucs", "--two-stems", "vocals", "-o", str(output_dir), str(audio_path)],
        check=True,
        capture_output=True,
    )
    # Demucs outputs to: output_dir/htdemucs/audio/vocals.wav
    vocals_path = output_dir / "htdemucs" / audio_path.stem / "vocals.wav"
    if not vocals_path.exists():
        raise FileNotFoundError(f"Vocal extraction failed: {vocals_path}")
    return vocals_path

def trim_audio(input_path: Path, output_path: Path, start_sec: float, end_sec: float) -> Path:
    """Trim audio to a specific time range using ffmpeg."""
    duration = end_sec - start_sec
    subprocess.run(
        [
            "ffmpeg", "-y", "-i", str(input_path),
            "-ss", str(start_sec), "-t", str(duration),
            "-ar", "22050", "-ac", "1",  # XTTS-v2 expects 22050Hz mono
            str(output_path),
        ],
        check=True,
        capture_output=True,
    )
    return output_path
```

**Step 3: Add YouTube voice creation endpoint to voices router**

Add to `backend/app/routers/voices.py`:

```python
from app.services.voice_pipeline import download_youtube_audio, extract_vocals

@router.post("/{voice_id}/from-youtube", response_model=VoiceOut)
async def create_voice_from_youtube(
    voice_id: int, url: str, db: AsyncSession = Depends(get_db)
):
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
```

**Step 4: Run tests**

```bash
cd backend && python -m pytest tests/test_voice_pipeline.py -v
```

**Step 5: Commit**

```bash
git add backend/
git commit -m "feat: voice pipeline with YouTube download and vocal isolation"
```

---

## Task 7: ARQ Worker & Job Queue

**Files:**
- Create: `backend/app/worker.py`
- Create: `backend/app/routers/jobs.py`
- Create: `backend/tests/test_jobs_api.py`
- Modify: `backend/app/main.py` (add router)

**Step 1: Write failing tests for jobs API**

```python
import pytest
from app.models import Book, Chapter, Voice

async def seed_book_and_voice(db_session):
    """Helper: create a book with one chapter and a voice."""
    book = Book(title="T", author="A", language="hu", original_filename="t.epub", chapter_count=1)
    db_session.add(book)
    await db_session.flush()
    chapter = Chapter(book_id=book.id, chapter_number=1, title="Ch1", text_content="Hello world", word_count=2)
    db_session.add(chapter)
    voice = Voice(name="V1", language="hu", source="upload", reference_clip_path="/fake/clip.wav")
    db_session.add(voice)
    await db_session.commit()
    return book, chapter, voice

@pytest.mark.asyncio
async def test_create_job(client, db_session):
    book, chapter, voice = await seed_book_and_voice(db_session)
    response = await client.post("/api/jobs/", json={"chapter_id": chapter.id, "voice_id": voice.id})
    assert response.status_code == 201
    assert response.json()["status"] == "queued"

@pytest.mark.asyncio
async def test_list_jobs(client, db_session):
    book, chapter, voice = await seed_book_and_voice(db_session)
    await client.post("/api/jobs/", json={"chapter_id": chapter.id, "voice_id": voice.id})
    response = await client.get("/api/jobs/")
    assert response.status_code == 200
    assert len(response.json()) >= 1

@pytest.mark.asyncio
async def test_generate_book_queues_all_chapters(client, db_session):
    book, chapter, voice = await seed_book_and_voice(db_session)
    response = await client.post(f"/api/jobs/generate-book/{book.id}", json={"voice_id": voice.id})
    assert response.status_code == 201
    jobs = response.json()
    assert len(jobs) >= 1
```

**Step 2: Run tests to verify they fail**

```bash
cd backend && python -m pytest tests/test_jobs_api.py -v
```

**Step 3: Implement jobs router**

```python
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import get_db
from app.models import Job, Chapter, Voice, Book
from app.schemas import JobCreate, JobOut
from pydantic import BaseModel

router = APIRouter(prefix="/api/jobs", tags=["jobs"])

class GenerateBookRequest(BaseModel):
    voice_id: int

@router.post("/", response_model=JobOut, status_code=201)
async def create_job(job: JobCreate, db: AsyncSession = Depends(get_db)):
    # Validate chapter and voice exist
    ch = await db.execute(select(Chapter).where(Chapter.id == job.chapter_id))
    if not ch.scalar_one_or_none():
        raise HTTPException(404, "Chapter not found")
    v = await db.execute(select(Voice).where(Voice.id == job.voice_id))
    if not v.scalar_one_or_none():
        raise HTTPException(404, "Voice not found")

    # Check for existing done job (cache hit)
    existing = await db.execute(
        select(Job).where(Job.chapter_id == job.chapter_id, Job.voice_id == job.voice_id, Job.status == "done")
    )
    if existing.scalar_one_or_none():
        raise HTTPException(409, "Audio already generated for this chapter+voice")

    db_job = Job(chapter_id=job.chapter_id, voice_id=job.voice_id, status="queued")
    db.add(db_job)
    await db.commit()
    await db.refresh(db_job)

    # TODO: Enqueue ARQ task here once worker is connected
    return db_job

@router.post("/generate-book/{book_id}", response_model=list[JobOut], status_code=201)
async def generate_book(book_id: int, req: GenerateBookRequest, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Book).where(Book.id == book_id))
    if not result.scalar_one_or_none():
        raise HTTPException(404, "Book not found")

    chapters = await db.execute(
        select(Chapter).where(Chapter.book_id == book_id).order_by(Chapter.chapter_number)
    )
    jobs = []
    for chapter in chapters.scalars().all():
        # Skip if already generated
        existing = await db.execute(
            select(Job).where(Job.chapter_id == chapter.id, Job.voice_id == req.voice_id, Job.status == "done")
        )
        if existing.scalar_one_or_none():
            continue
        job = Job(chapter_id=chapter.id, voice_id=req.voice_id, status="queued")
        db.add(job)
        jobs.append(job)

    await db.commit()
    for job in jobs:
        await db.refresh(job)
    return jobs

@router.get("/", response_model=list[JobOut])
async def list_jobs(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Job).order_by(Job.created_at.desc()))
    return result.scalars().all()

@router.get("/{job_id}", response_model=JobOut)
async def get_job(job_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Job).where(Job.id == job_id))
    job = result.scalar_one_or_none()
    if not job:
        raise HTTPException(404, "Job not found")
    return job
```

**Step 4: Implement worker.py**

```python
"""ARQ worker for TTS generation jobs."""
from arq import create_pool
from arq.connections import RedisSettings
from app.config import settings

# Placeholder TTS task — will be filled in Task 8
async def generate_tts(ctx, job_id: int):
    """Generate TTS audio for a job."""
    # TODO: Load XTTS-v2 model, generate audio, update job status
    pass

async def startup(ctx):
    """Worker startup — load TTS model into memory."""
    # TODO: Load XTTS-v2 model here
    ctx["tts_model"] = None

async def shutdown(ctx):
    """Worker shutdown — cleanup."""
    pass

class WorkerSettings:
    functions = [generate_tts]
    on_startup = startup
    on_shutdown = shutdown
    redis_settings = RedisSettings.from_dsn(settings.redis_url)
    max_jobs = 1  # GPU-bound, process one at a time
    job_timeout = 600  # 10 minutes per chapter
```

**Step 5: Register router in main.py**

```python
from app.routers import jobs
app.include_router(jobs.router)
```

**Step 6: Run tests**

```bash
cd backend && python -m pytest tests/test_jobs_api.py -v
```

**Step 7: Commit**

```bash
git add backend/
git commit -m "feat: job queue API and ARQ worker skeleton"
```

---

## Task 8: TTS Engine Integration (XTTS-v2)

**Files:**
- Create: `backend/app/services/tts_engine.py`
- Modify: `backend/app/worker.py` (wire up TTS)

**Step 1: Implement tts_engine.py**

```python
"""XTTS-v2 Text-to-Speech engine."""
import torch
from pathlib import Path
from TTS.api import TTS

class TTSEngine:
    def __init__(self):
        self.model = None
        self.device = "mps" if torch.backends.mps.is_available() else "cpu"

    def load_model(self):
        """Load XTTS-v2 model into memory."""
        self.model = TTS("tts_models/multilingual/multi-dataset/xtts_v2").to(self.device)

    def generate(self, text: str, reference_clip: Path, output_path: Path, language: str = "hu") -> Path:
        """Generate speech audio from text using a reference voice clip."""
        if not self.model:
            raise RuntimeError("TTS model not loaded. Call load_model() first.")

        # XTTS-v2 has a context window limit, split long text into chunks
        chunks = self._split_text(text, max_chars=500)
        chunk_paths = []

        for i, chunk in enumerate(chunks):
            chunk_path = output_path.parent / f"{output_path.stem}_chunk_{i}.wav"
            self.model.tts_to_file(
                text=chunk,
                speaker_wav=str(reference_clip),
                language=language,
                file_path=str(chunk_path),
            )
            chunk_paths.append(chunk_path)

        # Concatenate chunks
        if len(chunk_paths) == 1:
            chunk_paths[0].rename(output_path)
        else:
            self._concatenate_audio(chunk_paths, output_path)
            for cp in chunk_paths:
                cp.unlink(missing_ok=True)

        return output_path

    def _split_text(self, text: str, max_chars: int = 500) -> list[str]:
        """Split text into chunks at sentence boundaries."""
        sentences = []
        current = ""
        for sentence in text.replace("\n", " ").split(". "):
            candidate = f"{current}. {sentence}".strip() if current else sentence
            if len(candidate) > max_chars and current:
                sentences.append(current.strip())
                current = sentence
            else:
                current = candidate
        if current.strip():
            sentences.append(current.strip())
        return sentences if sentences else [text]

    def _concatenate_audio(self, paths: list[Path], output: Path):
        """Concatenate WAV files using ffmpeg."""
        import subprocess, tempfile
        with tempfile.NamedTemporaryFile(mode="w", suffix=".txt", delete=False) as f:
            for p in paths:
                f.write(f"file '{p}'\n")
            list_path = f.name
        subprocess.run(
            ["ffmpeg", "-y", "-f", "concat", "-safe", "0", "-i", list_path, "-c", "copy", str(output)],
            check=True, capture_output=True,
        )
        Path(list_path).unlink(missing_ok=True)
```

**Step 2: Wire up worker.py**

Replace the placeholder in `backend/app/worker.py`:

```python
"""ARQ worker for TTS generation jobs."""
from datetime import datetime
from pathlib import Path
from arq.connections import RedisSettings
from sqlalchemy import select
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from app.config import settings
from app.models import Job, Chapter, Voice
from app.database import Base
from app.services.tts_engine import TTSEngine

async def generate_tts(ctx, job_id: int):
    """Generate TTS audio for a job."""
    engine = ctx["db_engine"]
    tts: TTSEngine = ctx["tts_engine"]
    session_maker = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async with session_maker() as db:
        result = await db.execute(select(Job).where(Job.id == job_id))
        job = result.scalar_one_or_none()
        if not job:
            return

        # Mark processing
        job.status = "processing"
        await db.commit()

        try:
            # Load chapter and voice
            ch_result = await db.execute(select(Chapter).where(Chapter.id == job.chapter_id))
            chapter = ch_result.scalar_one()
            v_result = await db.execute(select(Voice).where(Voice.id == job.voice_id))
            voice = v_result.scalar_one()

            if not voice.reference_clip_path:
                raise ValueError("Voice has no reference clip")

            # Generate audio
            output_path = settings.audio_path / f"ch{chapter.id}_v{voice.id}.wav"
            tts.generate(
                text=chapter.text_content,
                reference_clip=Path(voice.reference_clip_path),
                output_path=output_path,
                language=voice.language,
            )

            # Update job
            job.status = "done"
            job.audio_output_path = str(output_path)
            job.completed_at = datetime.utcnow()
            await db.commit()

        except Exception as e:
            job.status = "failed"
            job.error_message = str(e)
            job.completed_at = datetime.utcnow()
            await db.commit()
            raise

async def startup(ctx):
    """Worker startup — load TTS model and DB engine."""
    tts = TTSEngine()
    tts.load_model()
    ctx["tts_engine"] = tts
    ctx["db_engine"] = create_async_engine(settings.database_url, echo=False)

async def shutdown(ctx):
    """Worker shutdown."""
    if "db_engine" in ctx:
        await ctx["db_engine"].dispose()

class WorkerSettings:
    functions = [generate_tts]
    on_startup = startup
    on_shutdown = shutdown
    redis_settings = RedisSettings.from_dsn(settings.redis_url)
    max_jobs = 1
    job_timeout = 600
```

**Step 3: Update jobs router to enqueue ARQ tasks**

Add to `backend/app/routers/jobs.py`:

```python
from arq import create_pool
from arq.connections import RedisSettings
from app.config import settings

async def get_redis_pool():
    return await create_pool(RedisSettings.from_dsn(settings.redis_url))

# In create_job(), after db.commit():
#   redis = await get_redis_pool()
#   await redis.enqueue_job("generate_tts", db_job.id)

# In generate_book(), after db.commit():
#   redis = await get_redis_pool()
#   for job in jobs:
#       await redis.enqueue_job("generate_tts", job.id)
```

**Step 4: Commit**

```bash
git add backend/
git commit -m "feat: XTTS-v2 TTS engine and ARQ worker integration"
```

---

## Task 9: Playback State API

**Files:**
- Create: `backend/app/routers/playback.py`
- Create: `backend/tests/test_playback_api.py`
- Modify: `backend/app/main.py` (add router)

**Step 1: Write failing tests**

```python
import pytest
from app.models import Book, Chapter, Voice

@pytest.mark.asyncio
async def test_save_playback_state(client, db_session):
    book = Book(title="T", author="A", language="hu", original_filename="t.epub", chapter_count=1)
    db_session.add(book)
    await db_session.flush()
    chapter = Chapter(book_id=book.id, chapter_number=1, title="Ch1", text_content="Hi", word_count=1)
    db_session.add(chapter)
    voice = Voice(name="V", language="hu", source="upload")
    db_session.add(voice)
    await db_session.commit()

    response = await client.put("/api/playback/", json={
        "book_id": book.id, "voice_id": voice.id,
        "current_chapter_id": chapter.id, "position_seconds": 42.5,
    })
    assert response.status_code == 200
    assert response.json()["position_seconds"] == 42.5

@pytest.mark.asyncio
async def test_get_playback_state(client, db_session):
    book = Book(title="T", author="A", language="hu", original_filename="t.epub", chapter_count=1)
    db_session.add(book)
    await db_session.flush()
    chapter = Chapter(book_id=book.id, chapter_number=1, title="Ch1", text_content="Hi", word_count=1)
    db_session.add(chapter)
    voice = Voice(name="V", language="hu", source="upload")
    db_session.add(voice)
    await db_session.commit()

    await client.put("/api/playback/", json={
        "book_id": book.id, "voice_id": voice.id,
        "current_chapter_id": chapter.id, "position_seconds": 10.0,
    })
    response = await client.get(f"/api/playback/?book_id={book.id}&voice_id={voice.id}")
    assert response.status_code == 200
    assert response.json()["position_seconds"] == 10.0
```

**Step 2: Implement playback router**

```python
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import get_db
from app.models import PlaybackState
from app.schemas import PlaybackStateUpdate, PlaybackStateOut

router = APIRouter(prefix="/api/playback", tags=["playback"])

@router.put("/", response_model=PlaybackStateOut)
async def save_playback_state(state: PlaybackStateUpdate, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(PlaybackState).where(
            PlaybackState.book_id == state.book_id,
            PlaybackState.voice_id == state.voice_id,
        )
    )
    existing = result.scalar_one_or_none()
    if existing:
        existing.current_chapter_id = state.current_chapter_id
        existing.position_seconds = state.position_seconds
    else:
        existing = PlaybackState(**state.model_dump())
        db.add(existing)
    await db.commit()
    await db.refresh(existing)
    return existing

@router.get("/", response_model=PlaybackStateOut)
async def get_playback_state(
    book_id: int = Query(...), voice_id: int = Query(...), db: AsyncSession = Depends(get_db)
):
    result = await db.execute(
        select(PlaybackState).where(
            PlaybackState.book_id == book_id,
            PlaybackState.voice_id == voice_id,
        )
    )
    state = result.scalar_one_or_none()
    if not state:
        raise HTTPException(404, "No playback state found")
    return state
```

**Step 3: Register router, run tests, commit**

```bash
cd backend && python -m pytest tests/test_playback_api.py -v
git add backend/ && git commit -m "feat: playback state save/restore API"
```

---

## Task 10: Frontend Scaffolding

**Files:**
- Create: `frontend/` (Next.js project)
- Create: `frontend/src/lib/api.ts`
- Create: `frontend/src/app/layout.tsx`

**Step 1: Create Next.js project**

```bash
cd /Users/peppertom/Projects/audiobook
npx create-next-app@latest frontend --typescript --tailwind --eslint --app --src-dir --no-import-alias
```

**Step 2: Create API client**

Create `frontend/src/lib/api.ts`:

```typescript
const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

async function fetchApi<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", ...options?.headers },
  });
  if (!res.ok) {
    throw new Error(`API error: ${res.status} ${res.statusText}`);
  }
  return res.json();
}

// Books
export const getBooks = () => fetchApi<Book[]>("/api/books/");
export const getBook = (id: number) => fetchApi<BookDetail>(`/api/books/${id}`);
export const uploadBook = async (file: File) => {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch(`${API_BASE}/api/books/upload`, { method: "POST", body: form });
  if (!res.ok) throw new Error("Upload failed");
  return res.json() as Promise<Book>;
};
export const deleteBook = (id: number) =>
  fetch(`${API_BASE}/api/books/${id}`, { method: "DELETE" });

// Voices
export const getVoices = () => fetchApi<Voice[]>("/api/voices/");
export const createVoice = (data: { name: string; language: string; source: string }) =>
  fetchApi<Voice>("/api/voices/", { method: "POST", body: JSON.stringify(data) });
export const deleteVoice = (id: number) =>
  fetch(`${API_BASE}/api/voices/${id}`, { method: "DELETE" });

// Jobs
export const getJobs = () => fetchApi<Job[]>("/api/jobs/");
export const generateBook = (bookId: number, voiceId: number) =>
  fetchApi<Job[]>(`/api/jobs/generate-book/${bookId}`, {
    method: "POST",
    body: JSON.stringify({ voice_id: voiceId }),
  });

// Playback
export const getPlaybackState = (bookId: number, voiceId: number) =>
  fetchApi<PlaybackState>(`/api/playback/?book_id=${bookId}&voice_id=${voiceId}`);
export const savePlaybackState = (state: PlaybackStateUpdate) =>
  fetchApi<PlaybackState>("/api/playback/", { method: "PUT", body: JSON.stringify(state) });

// Types
export interface Book {
  id: number; title: string; author: string; language: string;
  original_filename: string; chapter_count: number; created_at: string;
}
export interface Chapter {
  id: number; chapter_number: number; title: string; word_count: number;
}
export interface BookDetail extends Book { chapters: Chapter[]; }
export interface Voice {
  id: number; name: string; description: string; language: string;
  sample_audio_path: string | null; reference_clip_path: string | null;
  source: string; created_at: string;
}
export interface Job {
  id: number; chapter_id: number; voice_id: number; status: string;
  audio_output_path: string | null; duration_seconds: number | null;
  error_message: string | null; created_at: string; completed_at: string | null;
}
export interface PlaybackState {
  id: number; book_id: number; voice_id: number;
  current_chapter_id: number; position_seconds: number; updated_at: string;
}
export interface PlaybackStateUpdate {
  book_id: number; voice_id: number;
  current_chapter_id: number; position_seconds: number;
}
```

**Step 3: Update layout.tsx with navigation**

Replace `frontend/src/app/layout.tsx`:

```tsx
import type { Metadata } from "next";
import "./globals.css";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Audiobook",
  description: "Turn your books into audiobooks with custom voices",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="hu">
      <body className="bg-gray-950 text-gray-100 min-h-screen">
        <nav className="border-b border-gray-800 px-6 py-4">
          <div className="max-w-6xl mx-auto flex items-center gap-8">
            <Link href="/" className="text-xl font-bold">Audiobook</Link>
            <Link href="/" className="text-gray-400 hover:text-white">Library</Link>
            <Link href="/voices" className="text-gray-400 hover:text-white">Voices</Link>
            <Link href="/queue" className="text-gray-400 hover:text-white">Queue</Link>
          </div>
        </nav>
        <main className="max-w-6xl mx-auto px-6 py-8">{children}</main>
      </body>
    </html>
  );
}
```

**Step 4: Verify it runs**

```bash
cd frontend && npm run dev
# Visit http://localhost:3000 — should show layout with nav
```

**Step 5: Commit**

```bash
git add frontend/
git commit -m "feat: Next.js frontend scaffolding with API client and layout"
```

---

## Task 11: Frontend — Library Page (Book Grid + Upload)

**Files:**
- Create: `frontend/src/app/page.tsx`
- Create: `frontend/src/components/BookCard.tsx`
- Create: `frontend/src/components/FileUpload.tsx`

**Step 1: Create BookCard component**

```tsx
// frontend/src/components/BookCard.tsx
import Link from "next/link";
import { Book } from "@/lib/api";

export default function BookCard({ book }: { book: Book }) {
  return (
    <Link href={`/books/${book.id}`} className="block bg-gray-900 rounded-lg p-5 hover:bg-gray-800 transition">
      <h3 className="font-semibold text-lg truncate">{book.title}</h3>
      <p className="text-gray-400 text-sm mt-1">{book.author}</p>
      <p className="text-gray-500 text-xs mt-2">{book.chapter_count} chapters</p>
    </Link>
  );
}
```

**Step 2: Create FileUpload component**

```tsx
// frontend/src/components/FileUpload.tsx
"use client";
import { useCallback, useState } from "react";
import { uploadBook, Book } from "@/lib/api";

export default function FileUpload({ onUpload }: { onUpload: (book: Book) => void }) {
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);

  const handleFile = useCallback(async (file: File) => {
    if (!file.name.endsWith(".epub")) {
      alert("Only EPUB files are supported");
      return;
    }
    setUploading(true);
    try {
      const book = await uploadBook(file);
      onUpload(book);
    } catch (e) {
      alert("Upload failed");
    } finally {
      setUploading(false);
    }
  }, [onUpload]);

  return (
    <label
      className={`flex flex-col items-center justify-center border-2 border-dashed rounded-lg p-8 cursor-pointer transition ${
        dragging ? "border-blue-500 bg-blue-500/10" : "border-gray-700 hover:border-gray-500"
      }`}
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => { e.preventDefault(); setDragging(false); if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]); }}
    >
      <input type="file" accept=".epub" className="hidden" onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])} />
      {uploading ? (
        <p className="text-gray-400">Uploading...</p>
      ) : (
        <>
          <p className="text-gray-400">Drop an EPUB here or click to upload</p>
          <p className="text-gray-600 text-sm mt-1">EPUB format only</p>
        </>
      )}
    </label>
  );
}
```

**Step 3: Create Library page**

```tsx
// frontend/src/app/page.tsx
"use client";
import { useEffect, useState } from "react";
import { getBooks, Book } from "@/lib/api";
import BookCard from "@/components/BookCard";
import FileUpload from "@/components/FileUpload";

export default function LibraryPage() {
  const [books, setBooks] = useState<Book[]>([]);

  useEffect(() => { getBooks().then(setBooks); }, []);

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Library</h1>
      <FileUpload onUpload={(book) => setBooks((prev) => [book, ...prev])} />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mt-6">
        {books.map((book) => <BookCard key={book.id} book={book} />)}
      </div>
      {books.length === 0 && <p className="text-gray-500 text-center mt-8">No books yet. Upload an EPUB to get started.</p>}
    </div>
  );
}
```

**Step 4: Verify, commit**

```bash
cd frontend && npm run build
git add frontend/ && git commit -m "feat: library page with book grid and EPUB upload"
```

---

## Task 12: Frontend — Book Detail Page

**Files:**
- Create: `frontend/src/app/books/[id]/page.tsx`
- Create: `frontend/src/components/VoiceSelector.tsx`

**Step 1: Create VoiceSelector**

```tsx
// frontend/src/components/VoiceSelector.tsx
"use client";
import { useEffect, useState } from "react";
import { getVoices, Voice } from "@/lib/api";

export default function VoiceSelector({ selected, onSelect }: { selected: number | null; onSelect: (id: number) => void }) {
  const [voices, setVoices] = useState<Voice[]>([]);
  useEffect(() => { getVoices().then(setVoices); }, []);

  return (
    <div className="flex flex-wrap gap-2">
      {voices.map((v) => (
        <button
          key={v.id}
          onClick={() => onSelect(v.id)}
          className={`px-4 py-2 rounded-full text-sm transition ${
            selected === v.id ? "bg-blue-600 text-white" : "bg-gray-800 text-gray-300 hover:bg-gray-700"
          }`}
        >
          {v.name}
        </button>
      ))}
      {voices.length === 0 && <p className="text-gray-500 text-sm">No voices yet. Create one in the Voices page.</p>}
    </div>
  );
}
```

**Step 2: Create Book Detail page**

```tsx
// frontend/src/app/books/[id]/page.tsx
"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { getBook, generateBook, BookDetail, Job } from "@/lib/api";
import VoiceSelector from "@/components/VoiceSelector";

export default function BookDetailPage() {
  const { id } = useParams();
  const [book, setBook] = useState<BookDetail | null>(null);
  const [selectedVoice, setSelectedVoice] = useState<number | null>(null);
  const [generating, setGenerating] = useState(false);

  useEffect(() => { if (id) getBook(Number(id)).then(setBook); }, [id]);

  const handleGenerate = async () => {
    if (!book || !selectedVoice) return;
    setGenerating(true);
    try {
      await generateBook(book.id, selectedVoice);
      alert("Generation started! Check the Queue page for progress.");
    } catch (e) {
      alert("Failed to start generation");
    } finally {
      setGenerating(false);
    }
  };

  if (!book) return <p className="text-gray-400">Loading...</p>;

  return (
    <div>
      <h1 className="text-2xl font-bold">{book.title}</h1>
      <p className="text-gray-400 mt-1">{book.author}</p>

      <div className="mt-6">
        <h2 className="text-lg font-semibold mb-3">Select a voice</h2>
        <VoiceSelector selected={selectedVoice} onSelect={setSelectedVoice} />
      </div>

      <button
        onClick={handleGenerate}
        disabled={!selectedVoice || generating}
        className="mt-4 px-6 py-2 bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
      >
        {generating ? "Starting..." : "Generate Audiobook"}
      </button>

      <div className="mt-8">
        <h2 className="text-lg font-semibold mb-3">Chapters ({book.chapters.length})</h2>
        <ul className="space-y-2">
          {book.chapters.map((ch) => (
            <li key={ch.id} className="flex justify-between items-center bg-gray-900 rounded-lg px-4 py-3">
              <span>{ch.chapter_number}. {ch.title}</span>
              <span className="text-gray-500 text-sm">{ch.word_count} words</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
```

**Step 3: Verify, commit**

```bash
cd frontend && npm run build
git add frontend/ && git commit -m "feat: book detail page with chapter list and voice selector"
```

---

## Task 13: Frontend — Voices Page

**Files:**
- Create: `frontend/src/app/voices/page.tsx`

**Step 1: Implement Voices page**

```tsx
// frontend/src/app/voices/page.tsx
"use client";
import { useEffect, useState } from "react";
import { getVoices, createVoice, deleteVoice, Voice } from "@/lib/api";

export default function VoicesPage() {
  const [voices, setVoices] = useState<Voice[]>([]);
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);

  useEffect(() => { getVoices().then(setVoices); }, []);

  const handleCreate = async () => {
    if (!name.trim()) return;
    setCreating(true);
    try {
      const voice = await createVoice({ name, language: "hu", source: "upload" });
      setVoices((prev) => [voice, ...prev]);
      setName("");
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (id: number) => {
    await deleteVoice(id);
    setVoices((prev) => prev.filter((v) => v.id !== id));
  };

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Voices</h1>

      <div className="flex gap-3 mb-6">
        <input
          type="text"
          placeholder="Voice name..."
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="flex-1 bg-gray-900 border border-gray-700 rounded-lg px-4 py-2 focus:outline-none focus:border-blue-500"
        />
        <button
          onClick={handleCreate}
          disabled={!name.trim() || creating}
          className="px-6 py-2 bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition"
        >
          Create Voice
        </button>
      </div>

      <div className="space-y-3">
        {voices.map((voice) => (
          <div key={voice.id} className="flex justify-between items-center bg-gray-900 rounded-lg px-5 py-4">
            <div>
              <h3 className="font-semibold">{voice.name}</h3>
              <p className="text-gray-500 text-sm">
                {voice.source} &middot; {voice.reference_clip_path ? "Has reference clip" : "No reference clip yet"}
              </p>
            </div>
            <button onClick={() => handleDelete(voice.id)} className="text-red-400 hover:text-red-300 text-sm">
              Delete
            </button>
          </div>
        ))}
      </div>
      {voices.length === 0 && <p className="text-gray-500 text-center mt-8">No voices yet.</p>}
    </div>
  );
}
```

Note: Reference clip upload via file picker and YouTube voice creation will be added iteratively after the core flow works end-to-end.

**Step 2: Verify, commit**

```bash
cd frontend && npm run build
git add frontend/ && git commit -m "feat: voices page with create and delete"
```

---

## Task 14: Frontend — Queue Page

**Files:**
- Create: `frontend/src/app/queue/page.tsx`

**Step 1: Implement Queue page**

```tsx
// frontend/src/app/queue/page.tsx
"use client";
import { useEffect, useState } from "react";
import { getJobs, Job } from "@/lib/api";

const STATUS_COLORS: Record<string, string> = {
  queued: "text-yellow-400",
  processing: "text-blue-400",
  done: "text-green-400",
  failed: "text-red-400",
};

export default function QueuePage() {
  const [jobs, setJobs] = useState<Job[]>([]);

  useEffect(() => {
    const load = () => getJobs().then(setJobs);
    load();
    const interval = setInterval(load, 3000); // Poll every 3s
    return () => clearInterval(interval);
  }, []);

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Queue</h1>
      <div className="space-y-2">
        {jobs.map((job) => (
          <div key={job.id} className="flex justify-between items-center bg-gray-900 rounded-lg px-5 py-3">
            <div>
              <span className="text-sm text-gray-400">Job #{job.id}</span>
              <span className="text-sm text-gray-600 ml-3">Chapter {job.chapter_id}</span>
            </div>
            <span className={`text-sm font-medium ${STATUS_COLORS[job.status] || "text-gray-400"}`}>
              {job.status}
            </span>
          </div>
        ))}
      </div>
      {jobs.length === 0 && <p className="text-gray-500 text-center mt-8">No jobs in queue.</p>}
    </div>
  );
}
```

**Step 2: Verify, commit**

```bash
cd frontend && npm run build
git add frontend/ && git commit -m "feat: queue page with job status polling"
```

---

## Task 15: Frontend — Player Component

**Files:**
- Create: `frontend/src/components/Player.tsx`
- Modify: `frontend/src/app/layout.tsx` (add player)
- Modify: `frontend/src/app/books/[id]/page.tsx` (wire up playback)

**Step 1: Create Player component**

```tsx
// frontend/src/components/Player.tsx
"use client";
import { useEffect, useRef, useState } from "react";

interface PlayerProps {
  src: string | null;
  title: string;
  chapter: string;
  onEnded?: () => void;
  onTimeUpdate?: (time: number) => void;
}

export default function Player({ src, title, chapter, onEnded, onTimeUpdate }: PlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  const toggle = () => {
    if (!audioRef.current || !src) return;
    if (playing) audioRef.current.pause();
    else audioRef.current.play();
    setPlaying(!playing);
  };

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, "0")}`;
  };

  if (!src) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-gray-900 border-t border-gray-800 px-6 py-3">
      <audio
        ref={audioRef}
        src={src}
        onTimeUpdate={(e) => { setCurrentTime(e.currentTarget.currentTime); onTimeUpdate?.(e.currentTarget.currentTime); }}
        onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
        onEnded={() => { setPlaying(false); onEnded?.(); }}
      />
      <div className="max-w-6xl mx-auto flex items-center gap-4">
        <button onClick={toggle} className="text-white text-2xl w-10 h-10 flex items-center justify-center">
          {playing ? "⏸" : "▶"}
        </button>
        <div className="flex-1">
          <div className="flex justify-between text-sm mb-1">
            <span className="text-white font-medium truncate">{title} — {chapter}</span>
            <span className="text-gray-500">{formatTime(currentTime)} / {formatTime(duration)}</span>
          </div>
          <input
            type="range" min={0} max={duration || 0} value={currentTime}
            onChange={(e) => { if (audioRef.current) audioRef.current.currentTime = Number(e.target.value); }}
            className="w-full h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer"
          />
        </div>
      </div>
    </div>
  );
}
```

This is a basic player. Wiring it to the book detail page with chapter navigation and playback state persistence will be done when integrating the full flow.

**Step 2: Verify, commit**

```bash
cd frontend && npm run build
git add frontend/ && git commit -m "feat: audio player component with playback controls"
```

---

## Task 16: Docker Compose Setup

**Files:**
- Create: `docker-compose.yml`
- Create: `backend/Dockerfile`
- Create: `frontend/Dockerfile`

**Step 1: Create backend Dockerfile**

```dockerfile
FROM python:3.12-slim
WORKDIR /app
RUN apt-get update && apt-get install -y ffmpeg && rm -rf /var/lib/apt/lists/*
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

**Step 2: Create frontend Dockerfile**

```dockerfile
FROM node:20-slim
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build
CMD ["npm", "start"]
```

**Step 3: Create docker-compose.yml**

```yaml
services:
  frontend:
    build: ./frontend
    ports:
      - "3000:3000"
    environment:
      - NEXT_PUBLIC_API_URL=http://localhost:8000
    depends_on:
      - backend

  backend:
    build: ./backend
    ports:
      - "8000:8000"
    volumes:
      - ./storage:/app/storage
    environment:
      - AUDIOBOOK_REDIS_URL=redis://redis:6379
      - AUDIOBOOK_DATABASE_URL=sqlite+aiosqlite:///./storage/audiobook.db
    depends_on:
      - redis

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"

# Worker runs NATIVELY on Mac for MPS GPU access:
# cd backend && arq app.worker.WorkerSettings
```

**Step 4: Verify**

```bash
docker compose build
docker compose up -d redis  # Just redis for local dev
# Backend and frontend run natively during development
```

**Step 5: Commit**

```bash
git add docker-compose.yml backend/Dockerfile frontend/Dockerfile
git commit -m "feat: Docker setup with compose for frontend, backend, and Redis"
```

---

## Task 17: Integration Testing & End-to-End Verification

**Step 1: Start all services locally**

```bash
# Terminal 1: Redis
docker compose up redis

# Terminal 2: Backend
cd backend && uvicorn app.main:app --reload --port 8000

# Terminal 3: Worker (when XTTS-v2 is installed)
cd backend && arq app.worker.WorkerSettings

# Terminal 4: Frontend
cd frontend && npm run dev
```

**Step 2: Run full backend test suite**

```bash
cd backend && python -m pytest tests/ -v
```

**Step 3: Manual E2E flow**

1. Open http://localhost:3000
2. Upload an EPUB file
3. Verify it appears in the library
4. Click on the book, see chapters
5. Go to Voices, create a voice
6. Upload a reference clip for the voice
7. Go back to book, select the voice, hit Generate
8. Check Queue page for job progress
9. Once a chapter is done, play it

**Step 4: Commit any fixes**

```bash
git add -A && git commit -m "fix: integration test fixes and polish"
```

---

## Summary

| Task | Description | Estimated Steps |
|------|-------------|-----------------|
| 1 | Backend scaffolding | 8 |
| 2 | Database models & schemas | 6 |
| 3 | EPUB parser (TDD) | 5 |
| 4 | Book upload API (TDD) | 6 |
| 5 | Voice management API (TDD) | 6 |
| 6 | Voice pipeline (YouTube + vocals) | 5 |
| 7 | ARQ worker & job queue | 7 |
| 8 | TTS engine (XTTS-v2) | 4 |
| 9 | Playback state API | 3 |
| 10 | Frontend scaffolding | 5 |
| 11 | Library page | 4 |
| 12 | Book detail page | 3 |
| 13 | Voices page | 2 |
| 14 | Queue page | 2 |
| 15 | Player component | 2 |
| 16 | Docker setup | 5 |
| 17 | Integration testing | 4 |

**Total: 17 tasks, ~77 steps**

Dependencies: Tasks 1-2 must be done first. Tasks 3-9 (backend) can proceed in order. Tasks 10-15 (frontend) can start after Task 10 scaffolding is done. Task 16 can be done anytime. Task 17 is last.
