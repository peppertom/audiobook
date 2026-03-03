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
