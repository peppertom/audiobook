from pathlib import Path
from ebooklib import epub
import ebooklib
from bs4 import BeautifulSoup


def parse_epub(file_path: Path) -> dict:
    """Parse an EPUB file, extract metadata and chapters with plain text."""
    book = epub.read_epub(str(file_path))

    # Extract metadata
    title = book.get_metadata("DC", "title")
    title = title[0][0] if title else "Unknown Title"
    creator = book.get_metadata("DC", "creator")
    author = creator[0][0] if creator else "Unknown"
    language = book.get_metadata("DC", "language")
    language = language[0][0] if language else "hu"

    # Extract chapters from spine order
    chapters = []
    chapter_num = 0
    for item in book.get_items_of_type(ebooklib.ITEM_DOCUMENT):
        # Skip navigation documents (table of contents, NCX)
        if isinstance(item, epub.EpubNav):
            continue
        if item.get_name().endswith("nav.xhtml"):
            continue

        content = item.get_content().decode("utf-8", errors="replace")
        soup = BeautifulSoup(content, "lxml")
        text = soup.get_text(separator=" ", strip=True)

        if len(text.strip()) < 10:
            continue  # Skip near-empty pages (cover, copyright, etc.)

        chapter_num += 1
        # Try to find a heading for the chapter title
        heading = soup.find(["h1", "h2", "h3"])
        ch_title = heading.get_text(strip=True) if heading else f"Chapter {chapter_num}"

        chapters.append({
            "chapter_number": chapter_num,
            "title": ch_title,
            "text": text,
            "word_count": len(text.split()),
        })

    return {
        "title": title,
        "author": author,
        "language": language,
        "chapters": chapters,
    }
