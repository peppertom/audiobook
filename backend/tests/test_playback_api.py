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
