import pytest
from io import BytesIO
from pathlib import Path
from unittest.mock import patch, AsyncMock
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


@pytest.mark.asyncio
async def test_upload_book_generates_summaries(client, tmp_path):
    """Upload should attempt summary generation for each chapter."""
    epub_bytes = create_test_epub_bytes()
    with patch("app.routers.books.LLMAnnotator") as MockAnnotator:
        instance = MockAnnotator.return_value
        instance.generate_summary = AsyncMock(return_value="Test summary.")
        response = await client.post(
            "/api/books/upload",
            files={"file": ("test.epub", BytesIO(epub_bytes), "application/epub+zip")},
        )
    assert response.status_code == 201
    assert instance.generate_summary.call_count >= 1


@pytest.mark.asyncio
async def test_upload_succeeds_when_ollama_unavailable(client, tmp_path):
    """Upload should succeed even if Ollama is down (summary = None)."""
    epub_bytes = create_test_epub_bytes()
    with patch("app.routers.books.LLMAnnotator") as MockAnnotator:
        instance = MockAnnotator.return_value
        instance.generate_summary = AsyncMock(return_value="")
        response = await client.post(
            "/api/books/upload",
            files={"file": ("test.epub", BytesIO(epub_bytes), "application/epub+zip")},
        )
    assert response.status_code == 201


@pytest.mark.asyncio
async def test_generate_summaries_endpoint(client, tmp_path):
    """POST /api/books/{id}/generate-summaries should generate missing summaries."""
    epub_bytes = create_test_epub_bytes()
    with patch("app.routers.books.LLMAnnotator") as MockAnnotator:
        instance = MockAnnotator.return_value
        instance.generate_summary = AsyncMock(return_value="")
        upload = await client.post(
            "/api/books/upload",
            files={"file": ("test.epub", BytesIO(epub_bytes), "application/epub+zip")},
        )
    book_id = upload.json()["id"]

    with patch("app.routers.books.LLMAnnotator") as MockAnnotator:
        instance = MockAnnotator.return_value
        instance.generate_summary = AsyncMock(return_value="Generated summary.")
        response = await client.post(f"/api/books/{book_id}/generate-summaries")

    assert response.status_code == 200
    data = response.json()
    assert data["generated"] >= 1
