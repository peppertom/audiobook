import shutil
import tempfile
from pathlib import Path
from fastapi import APIRouter, Depends, UploadFile, File, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from app.database import get_db
from app.config import settings
from app.models import Book, Chapter, User
from app.schemas import BookOut, BookDetailOut, CostEstimateResponse
from app.services.epub_parser import parse_epub
from app.services.credits import calculate_credits_needed, get_balance, WORDS_PER_CREDIT
from app.services import storage
from app.auth import get_current_user

router = APIRouter(prefix="/api/books", tags=["books"])


async def _get_user_book(book_id: int, user_id: str, db: AsyncSession) -> Book:
    """Fetch a book that belongs to the current user. Raises 404 if not found or not owned."""
    result = await db.execute(
        select(Book).where(Book.id == book_id, Book.user_id == user_id)
    )
    book = result.scalar_one_or_none()
    if not book:
        raise HTTPException(404, "Book not found")
    return book


@router.post("/upload", response_model=BookOut, status_code=201)
async def upload_book(
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if not file.filename or not file.filename.endswith(".epub"):
        raise HTTPException(400, "Only EPUB files are supported")

    if storage.is_remote():
        # Save to temp file, parse, then discard (text stored in DB)
        with tempfile.NamedTemporaryFile(suffix=".epub", delete=False) as tmp:
            shutil.copyfileobj(file.file, tmp)
            tmp_path = Path(tmp.name)
        try:
            parsed = parse_epub(tmp_path)
        finally:
            tmp_path.unlink(missing_ok=True)
    else:
        file_path = settings.books_path / file.filename
        with open(file_path, "wb") as f:
            shutil.copyfileobj(file.file, f)
        parsed = parse_epub(file_path)

    book = Book(
        title=parsed["title"],
        author=parsed["author"],
        language=parsed["language"],
        original_filename=file.filename,
        chapter_count=len(parsed["chapters"]),
        user_id=user.id,
    )
    db.add(book)
    await db.flush()

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
async def list_books(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Book).where(Book.user_id == user.id).order_by(Book.created_at.desc())
    )
    return result.scalars().all()


@router.get("/{book_id}", response_model=BookDetailOut)
async def get_book(
    book_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Book)
        .where(Book.id == book_id, Book.user_id == user.id)
        .options(selectinload(Book.chapters))
    )
    book = result.scalar_one_or_none()
    if not book:
        raise HTTPException(404, "Book not found")
    return book


@router.get("/{book_id}/chapters/{chapter_id}/text")
async def get_chapter_text(
    book_id: int,
    chapter_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    # Verify book ownership first
    await _get_user_book(book_id, user.id, db)
    result = await db.execute(
        select(Chapter).where(Chapter.id == chapter_id, Chapter.book_id == book_id)
    )
    chapter = result.scalar_one_or_none()
    if not chapter:
        raise HTTPException(404, "Chapter not found")
    return {"id": chapter.id, "title": chapter.title, "text_content": chapter.text_content}


@router.get("/{book_id}/cost-estimate", response_model=CostEstimateResponse)
async def get_cost_estimate(
    book_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Book)
        .where(Book.id == book_id, Book.user_id == user.id)
        .options(selectinload(Book.chapters))
    )
    book = result.scalar_one_or_none()
    if not book:
        raise HTTPException(404, "Book not found")

    total_words = sum(ch.word_count for ch in book.chapters)
    credits_required = calculate_credits_needed(total_words)
    current_balance = await get_balance(db, user.id)
    estimated_cost_usd = round(credits_required * 0.50, 2)

    return CostEstimateResponse(
        total_words=total_words,
        credits_required=credits_required,
        estimated_cost_usd=estimated_cost_usd,
        current_balance=current_balance,
        sufficient_credits=current_balance >= credits_required,
    )


@router.delete("/{book_id}", status_code=204)
async def delete_book(
    book_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    book = await _get_user_book(book_id, user.id, db)
    if not storage.is_remote():
        file_path = settings.books_path / book.original_filename
        if file_path.exists():
            file_path.unlink()
    await db.delete(book)
    await db.commit()
