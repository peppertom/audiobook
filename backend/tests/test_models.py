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
