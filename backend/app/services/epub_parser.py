from pathlib import Path
from ebooklib import epub
import ebooklib
from bs4 import BeautifulSoup
from app.services.text_normalizer import classify_segment, preprocess_for_tts


def extract_segments_from_html(html_content: str) -> list[dict]:
    """Parse HTML content into structured segments with type classification."""
    soup = BeautifulSoup(html_content, "lxml")
    segments = []

    for element in soup.find_all(["h1", "h2", "h3", "p", "div"]):
        # Skip nested elements already captured by parent
        if element.find_parent(["h1", "h2", "h3", "p"]):
            continue

        raw_text = element.get_text(strip=True)
        if not raw_text or len(raw_text) < 3:
            continue

        is_italic = bool(element.find(["em", "i"])) or element.name in ("em", "i")
        is_heading = element.name in ("h1", "h2", "h3")

        seg_type = "heading" if is_heading else classify_segment(raw_text, has_italic=is_italic)
        normalized = preprocess_for_tts(raw_text)

        segments.append({
            "text": normalized,
            "raw_text": raw_text,
            "type": seg_type,
            "is_heading": is_heading,
            "word_count": len(normalized.split()),
        })

    return segments


def parse_epub(file_path: Path) -> dict:
    """Parse an EPUB file, extract metadata and chapters with structured segments."""
    book = epub.read_epub(str(file_path))

    title = book.get_metadata("DC", "title")
    title = title[0][0] if title else "Unknown Title"
    creator = book.get_metadata("DC", "creator")
    author = creator[0][0] if creator else "Unknown"
    language = book.get_metadata("DC", "language")
    language = language[0][0] if language else "hu"

    chapters = []
    chapter_num = 0
    for item in book.get_items_of_type(ebooklib.ITEM_DOCUMENT):
        if isinstance(item, epub.EpubNav):
            continue
        if item.get_name().endswith("nav.xhtml"):
            continue

        content = item.get_content().decode("utf-8", errors="replace")
        segments = extract_segments_from_html(content)

        if not segments:
            continue

        # Full plain text from segments for backward compatibility
        full_text = " ".join(s["text"] for s in segments)
        if len(full_text.strip()) < 10:
            continue

        chapter_num += 1
        heading_seg = next((s for s in segments if s["is_heading"]), None)
        ch_title = heading_seg["text"] if heading_seg else f"Chapter {chapter_num}"

        chapters.append({
            "chapter_number": chapter_num,
            "title": ch_title,
            "text": full_text,
            "word_count": len(full_text.split()),
            "segments": segments,
        })

    return {
        "title": title,
        "author": author,
        "language": language,
        "chapters": chapters,
    }
