import json
import shutil
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
from app.auth import get_current_user

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
            segments=json.dumps(ch.get("segments", []), ensure_ascii=False),
        )
        db.add(chapter)

    await db.commit()
    await db.refresh(book)
    return book


@router.get("", response_model=list[BookOut])
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


@router.get("/{book_id}/chapters/{chapter_id}/text")
async def get_chapter_text(book_id: int, chapter_id: int, db: AsyncSession = Depends(get_db)):
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
    """Estimate conversion cost in credits for a book."""
    result = await db.execute(
        select(Book).where(Book.id == book_id).options(selectinload(Book.chapters))
    )
    book = result.scalar_one_or_none()
    if not book:
        raise HTTPException(404, "Book not found")

    total_words = sum(ch.word_count for ch in book.chapters)
    credits_required = calculate_credits_needed(total_words)
    current_balance = await get_balance(db, user.id)
    # Placeholder: $0.50 per credit
    estimated_cost_usd = round(credits_required * 0.50, 2)

    return CostEstimateResponse(
        total_words=total_words,
        credits_required=credits_required,
        estimated_cost_usd=estimated_cost_usd,
        current_balance=current_balance,
        sufficient_credits=current_balance >= credits_required,
    )


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
