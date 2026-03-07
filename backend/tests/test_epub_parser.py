import pytest
from pathlib import Path
from ebooklib import epub
from app.services.epub_parser import extract_segments_from_html, parse_epub


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


def test_extract_heading():
    html = "<html><body><h2>Első fejezet</h2><p>Szöveg itt.</p></body></html>"
    segments = extract_segments_from_html(html)
    headings = [s for s in segments if s["is_heading"]]
    assert len(headings) == 1
    assert headings[0]["text"] == "Első fejezet"


def test_extract_dialogue_paragraph():
    html = '<html><body><p>\u201eGyere!\u201d \u2014 ki\u00e1ltotta.</p></body></html>'
    segments = extract_segments_from_html(html)
    assert segments[0]["type"] == "dialogue"


def test_extract_italic_as_inner_monologue():
    html = "<html><body><p><em>Sosem fogja meg\u00e9rteni.</em></p></body></html>"
    segments = extract_segments_from_html(html)
    assert segments[0]["type"] == "inner_monologue"


def test_skips_empty_paragraphs():
    html = "<html><body><p>   </p><p>Val\u00f3di sz\u00f6veg.</p></body></html>"
    segments = extract_segments_from_html(html)
    assert len(segments) == 1


def test_word_count_correct():
    html = "<html><body><p>Egy k\u00e9t h\u00e1rom.</p></body></html>"
    segments = extract_segments_from_html(html)
    assert segments[0]["word_count"] == 3
