import re
from pathlib import Path
from ebooklib import epub
import ebooklib
from bs4 import BeautifulSoup
from app.services.text_normalizer import classify_segment, preprocess_for_tts

# Hungarian capital letters (for sentence-start detection)
_HU_UPPER = "A-ZÁÉÍÓÖŐÚÜŰ"


def _extract_title_from_text(segments: list[dict], chapter_num: int) -> str:
    """Extract a chapter title from parsed segments when no heading tag is present.

    Uses the first segment's raw text if available, otherwise falls back to
    joining all segment texts and scanning from the start.
    """
    if not segments:
        return f"Chapter {chapter_num}"
    # Try the first segment alone first (it may be a standalone title paragraph)
    first = segments[0].get("raw_text", segments[0].get("text", "")).strip()
    result = _extract_title_from_string(first, chapter_num)
    if result != f"Chapter {chapter_num}":
        return result
    # Fall back to the full joined text
    full = " ".join(s.get("raw_text", s.get("text", "")) for s in segments).strip()
    return _extract_title_from_string(full, chapter_num)


def _extract_title_from_string(text: str, chapter_num: int) -> str:
    """Extract a chapter title from a raw string.

    Two patterns:
    1. Short segment with no terminal punctuation → the whole thing is the title.
    2. Otherwise: scan word-by-word. The title is the initial words up to
       (not including) the first subsequent word that starts with a Title-Case
       letter (starts uppercase but is not ALL-CAPS). ALL-CAPS words (like
       "FEJEZET") are kept as part of the title; single-letter uppercase words
       (Hungarian articles "A") end the title.
    """
    text = re.sub(r"\s+", " ", text).strip()
    if not text:
        return f"Chapter {chapter_num}"

    # Short text with no terminal punctuation → treat as standalone title line
    if len(text) <= 80 and not re.search(r"[.!?…]\s*$", text):
        return text

    words = text.split(" ")

    def _is_sentence_start(word: str) -> bool:
        # Strip leading typographic punctuation
        w = re.sub(r'^[„"«»\'"–—(]+', "", word)
        if not w or not w[0].isalpha():
            return False
        first = w[0]
        if not first.isupper():
            return False
        # Single uppercase letter (article "A") → sentence start
        if len(w) == 1:
            return True
        # ALL-CAPS word (e.g. "FEJEZET", "ELSŐ") → still part of title
        if w.upper() == w:
            return False
        # Title-Case word → sentence start
        return True

    # First word always belongs to the title
    title_words = [words[0]]
    for word in words[1:]:
        if _is_sentence_start(word):
            break
        title_words.append(word)

    candidate = " ".join(title_words).strip()
    # Reject suspiciously long results
    if len(title_words) > 10 or len(candidate) > 80:
        return f"Chapter {chapter_num}"

    return candidate or f"Chapter {chapter_num}"


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
        ch_title = heading_seg["text"] if heading_seg else _extract_title_from_text(segments, chapter_num)

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
