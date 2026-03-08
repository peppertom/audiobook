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
from app.services.epub_parser import parse_epub, _extract_title_from_text, _extract_title_from_string
from app.services.llm_annotator import LLMAnnotator
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
    chapters = []
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
        chapters.append((chapter, ch["text"]))

    await db.flush()

    # Generate summaries via LLM (non-blocking on failure)
    language_map = {"hu": "Hungarian", "en": "English", "de": "German", "fr": "French"}
    language = language_map.get(parsed["language"], "English")
    annotator = LLMAnnotator(base_url=settings.ollama_url, model=settings.ollama_model)
    for chapter, text in chapters:
        summary = await annotator.generate_summary(text, language=language)
        if summary:
            chapter.summary = summary

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


@router.post("/{book_id}/chapters/{chapter_id}/generate-summary")
async def generate_chapter_summary(book_id: int, chapter_id: int, db: AsyncSession = Depends(get_db)):
    """Generate summary for a single chapter."""
    result = await db.execute(
        select(Chapter).where(Chapter.id == chapter_id, Chapter.book_id == book_id)
    )
    chapter = result.scalar_one_or_none()
    if not chapter:
        raise HTTPException(404, "Chapter not found")

    book_result = await db.execute(select(Book).where(Book.id == book_id))
    book = book_result.scalar_one_or_none()

    language_map = {"hu": "Hungarian", "en": "English", "de": "German", "fr": "French"}
    language = language_map.get(book.language if book else "hu", "Hungarian")
    annotator = LLMAnnotator(base_url=settings.ollama_url, model=settings.ollama_model)

    summary = await annotator.generate_summary(chapter.text_content, language=language)
    if not summary:
        raise HTTPException(503, "Summary generation failed. Is Ollama running?")

    chapter.summary = summary
    await db.commit()
    return {"summary": summary}


@router.post("/{book_id}/generate-summaries")
async def generate_summaries(book_id: int, db: AsyncSession = Depends(get_db)):
    """Generate summaries for all chapters that don't have one yet."""
    result = await db.execute(
        select(Book).where(Book.id == book_id).options(selectinload(Book.chapters))
    )
    book = result.scalar_one_or_none()
    if not book:
        raise HTTPException(404, "Book not found")

    language_map = {"hu": "Hungarian", "en": "English", "de": "German", "fr": "French"}
    language = language_map.get(book.language, "English")
    annotator = LLMAnnotator(base_url=settings.ollama_url, model=settings.ollama_model)

    generated = 0
    failed = 0
    for chapter in [ch for ch in book.chapters if not ch.summary]:
        summary = await annotator.generate_summary(chapter.text_content, language=language)
        if summary:
            chapter.summary = summary
            generated += 1
        else:
            failed += 1

    await db.commit()
    return {"generated": generated, "failed": failed, "total": len(book.chapters)}


@router.post("/{book_id}/retitle-chapters")
async def retitle_chapters(book_id: int, db: AsyncSession = Depends(get_db)):
    """Re-extract chapter titles from stored segments for an already-imported book."""
    result = await db.execute(
        select(Book).where(Book.id == book_id).options(selectinload(Book.chapters))
    )
    book = result.scalar_one_or_none()
    if not book:
        raise HTTPException(404, "Book not found")

    updated = 0
    for ch in book.chapters:
        segments = json.loads(ch.segments) if ch.segments else []
        if segments:
            new_title = _extract_title_from_text(segments, ch.chapter_number)
        else:
            # Fall back to plain text_content when segments weren't stored
            new_title = _extract_title_from_string(ch.text_content or "", ch.chapter_number)
        if new_title != ch.title:
            ch.title = new_title
            updated += 1

    await db.commit()
    return {"updated": updated, "total": len(book.chapters)}


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
