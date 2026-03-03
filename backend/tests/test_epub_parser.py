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
