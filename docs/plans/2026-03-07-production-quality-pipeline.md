# Production-Quality Audiobook Pipeline — Implementációs Terv

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Az XTTS-v2 pipeline-t érzelem-vezérelt, strukturált szövegfeldolgozással és LLM-annotációval bővíteni szinkronszínész-közelí minőség eléréséhez.

**Architecture:** A jelenlegi egycsatornás TTS pipeline-t három réteggel egészítjük ki: (1) strukturált EPUB parsing + szövegnormalizálás, (2) érzelem-bank UI a hangminták felvételéhez, (3) lokális LLM-annotátor, amely fejezetszinten és szegmensszinten érzelmeket rendel a szöveghez, majd az érzelem-bank megfelelő referencia klipjét választja ki TTS-hez.

**Tech Stack:** FastAPI, SQLAlchemy async, ARQ worker, XTTS-v2 (Coqui TTS), pydub, ffmpeg, Ollama (Qwen2.5:7b-instruct), Next.js + MediaRecorder API, PostgreSQL

---

## Lokális LLM Ajánlás (Phase 2-höz)

Ollama-n futtatandó modellek, prioritás sorrendben:

| Model | Parancs | Miért? |
|-------|---------|--------|
| **Qwen2.5:7b-instruct** | `ollama pull qwen2.5:7b-instruct` | Legjobb választás: kiemelkedő multilingual JSON output, erős magyarul, 7B elfér CPU-n is |
| mistral:7b-instruct | `ollama pull mistral:7b-instruct` | Gyorsabb, de gyengébb magyarul |
| gemma2:9b | `ollama pull gemma2:9b` | Google modell, jó multilingual, de nagyobb |
| qwen2.5:14b-instruct | `ollama pull qwen2.5:14b-instruct` | Ha GPU van: jobb minőség |

**Telepítés:** `brew install ollama && ollama serve` (háttérben fut a 11434-es porton)

---

## Fontos háttér a kódbázisról

Mielőtt bármit fejlesztesz, olvasd el ezeket a fájlokat:

- `backend/app/services/epub_parser.py` — jelenlegi lapos parser (soup.get_text)
- `backend/app/services/tts_engine.py` — XTTS-v2 wrapper, single ref clip, raw concat
- `backend/app/worker.py` — ARQ job orchestrator
- `backend/app/models.py` — SQLAlchemy modellek
- `backend/app/routers/voices.py` — hangfájl upload logika (convert_to_wav helper)
- `backend/app/config.py` — settings (storage_path, voices_path, stb.)
- `backend/tests/conftest.py` — SQLite in-memory tesztkörnyezet (create_all auto-fut)

**DB migráció:** Alembic nincs bevezetve. Új oszlopok hozzáadásához:
```bash
# Fut a dev adatbázison (PostgreSQL port 5433):
docker exec -it audiobook-db psql -U audiobook -d audiobook -c "ALTER TABLE chapters ADD COLUMN IF NOT EXISTS segments TEXT;"
```
A tesztekben a `create_all` automatikusan felépíti az új oszlopokat.

---

## Phase 1A: Szöveg Pipeline Foundation

**Scope:** Szövegnormalizálás + strukturált EPUB parsing. Ez a legfontosabb alap — a többi phase erre épül.

**Érintett fájlok:**
- Létrehozandó: `backend/app/services/text_normalizer.py`
- Módosítandó: `backend/app/services/epub_parser.py`
- Módosítandó: `backend/app/models.py`
- Módosítandó: `backend/app/worker.py`
- Létrehozandó: `backend/tests/test_text_normalizer.py`
- Módosítandó: `backend/tests/test_epub_parser.py`

---

### Task 1: text_normalizer.py — Szöveg előfeldolgozás TTS-hez

**Fájl:** `backend/app/services/text_normalizer.py` (új fájl)

**Step 1: Írj failing tesztet**

Fájl: `backend/tests/test_text_normalizer.py`

```python
import pytest
from app.services.text_normalizer import preprocess_for_tts, classify_segment


def test_em_dash_replaced():
    assert preprocess_for_tts("Várj — mondta") == "Várj, mondta"


def test_en_dash_replaced():
    assert preprocess_for_tts("ez – az") == "ez, az"


def test_ellipsis_normalized():
    result = preprocess_for_tts("Igen...")
    assert result == "Igen… "


def test_footnote_ref_removed():
    assert preprocess_for_tts("szöveg[12] folytatás") == "szöveg folytatás"


def test_dr_expanded():
    assert preprocess_for_tts("Dr. Kiss Péter") == "Doktor Kiss Péter"


def test_prof_expanded():
    assert preprocess_for_tts("Prof. Nagy") == "Professzor Nagy"


def test_empty_string():
    assert preprocess_for_tts("") == ""


def test_classify_dialogue_hungarian_quotes():
    assert classify_segment("„Gyere ide!" — mondta.") == "dialogue"


def test_classify_dialogue_english_quotes():
    assert classify_segment('"Come here!" he said.') == "dialogue"


def test_classify_inner_monologue():
    assert classify_segment("Sosem fogja megérteni", has_italic=True) == "inner_monologue"


def test_classify_action_beat():
    result = classify_segment("Felkapta a kabátját és futott.")
    assert result == "action"


def test_classify_narration_default():
    result = classify_segment("A szoba sarkában egy régi szekrény állt.")
    assert result == "narration"
```

**Step 2: Futtasd a tesztet, ellenőrizd hogy fail**

```bash
cd backend
source .venv/bin/activate
pytest tests/test_text_normalizer.py -v
```

Várt kimenet: `ModuleNotFoundError: No module named 'app.services.text_normalizer'`

**Step 3: Implementáld a modult**

Fájl: `backend/app/services/text_normalizer.py`

```python
import re


def preprocess_for_tts(text: str) -> str:
    """Normalize text for TTS synthesis."""
    if not text:
        return ""
    text = text.replace("—", ", ")
    text = text.replace(" – ", ", ")
    text = re.sub(r"\[(\d+)\]", "", text)
    text = re.sub(r"\bDr\.", "Doktor", text)
    text = re.sub(r"\bProf\.", "Professzor", text)
    text = text.replace("...", "… ")
    return text.strip()


_DIALOGUE_RE = re.compile(r'[„""][^„""]{5,}["""]')
_ACTION_VERBS_HU = re.compile(
    r"\b(futott|felkapta|megfordult|becsapta|felállt|rárontott|elesett|"
    r"kiáltott|ugrott|rohant|rántotta|lökte|ragadta|dobta|csapta)\b",
    re.IGNORECASE,
)


def classify_segment(text: str, has_italic: bool = False) -> str:
    """Classify a text segment into a narration type."""
    if _DIALOGUE_RE.search(text):
        return "dialogue"
    if has_italic:
        return "inner_monologue"
    if len(text.split()) < 12 and _ACTION_VERBS_HU.search(text):
        return "action"
    return "narration"
```

**Step 4: Futtasd a tesztet, ellenőrizd hogy pass**

```bash
pytest tests/test_text_normalizer.py -v
```

Várt kimenet: `10 passed`

**Step 5: Commit**

```bash
git add backend/app/services/text_normalizer.py backend/tests/test_text_normalizer.py
git commit -m "feat: add text normalizer and segment classifier"
```

---

### Task 2: EPUB DOM Walker — Strukturált szegmens kinyerés

**Fájl:** `backend/app/services/epub_parser.py` (módosítás)

A jelenlegi `soup.get_text()` mindent eldobál. DOM walkert kell írni, ami megőrzi a struktúrát.

**Step 1: Olvasd el a jelenlegi fájlt**

```bash
cat backend/app/services/epub_parser.py
```

**Step 2: Írj failing teszteket**

Fájl: `backend/tests/test_epub_parser.py` — adj hozzá ezeket:

```python
from app.services.epub_parser import extract_segments_from_html, parse_epub


def test_extract_heading():
    html = "<html><body><h2>Első fejezet</h2><p>Szöveg itt.</p></body></html>"
    segments = extract_segments_from_html(html)
    headings = [s for s in segments if s["is_heading"]]
    assert len(headings) == 1
    assert headings[0]["text"] == "Első fejezet"


def test_extract_dialogue_paragraph():
    html = '<html><body><p>„Gyere!" — kiáltotta.</p></body></html>'
    segments = extract_segments_from_html(html)
    assert segments[0]["type"] == "dialogue"


def test_extract_italic_as_inner_monologue():
    html = "<html><body><p><em>Sosem fogja megérteni.</em></p></body></html>"
    segments = extract_segments_from_html(html)
    assert segments[0]["type"] == "inner_monologue"


def test_skips_empty_paragraphs():
    html = "<html><body><p>   </p><p>Valódi szöveg.</p></body></html>"
    segments = extract_segments_from_html(html)
    assert len(segments) == 1


def test_word_count_correct():
    html = "<html><body><p>Egy két három.</p></body></html>"
    segments = extract_segments_from_html(html)
    assert segments[0]["word_count"] == 3
```

**Step 3: Futtasd, ellenőrizd hogy fail**

```bash
pytest tests/test_epub_parser.py -v
```

Várt: `ImportError: cannot import name 'extract_segments_from_html'`

**Step 4: Módosítsd az epub_parser.py-t**

A teljes fájl új tartalma:

```python
from pathlib import Path
from ebooklib import epub
import ebooklib
from bs4 import BeautifulSoup, Tag
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
```

**Step 5: Futtasd a teszteket**

```bash
pytest tests/test_epub_parser.py -v
```

Várt: minden test pass (a régi tesztek is, mert a `parse_epub` API nem változott)

**Step 6: Commit**

```bash
git add backend/app/services/epub_parser.py backend/tests/test_epub_parser.py
git commit -m "feat: epub DOM walker with structured segment extraction"
```

---

### Task 3: Chapter model — segments mező hozzáadása

**Fájl:** `backend/app/models.py` (módosítás)

**Step 1: Olvasd el a models.py-t**

Keresd a `Chapter` osztályt (kb. sor 78-86).

**Step 2: Adj hozzá két mezőt**

A `Chapter` osztályban a `word_count` sor után add hozzá:

```python
segments: Mapped[str | None] = mapped_column(Text, nullable=True)
# JSON: [{"text": str, "type": str, "is_heading": bool, "word_count": int}]
emotional_arc: Mapped[str | None] = mapped_column(Text, nullable=True)
# JSON: {"dominant_emotion": str, "pacing": str, "intensity": int, "narrator_note": str}
```

**Step 3: DB migráció futtatása (dev DB)**

```bash
docker exec -it audiobook-db psql -U audiobook -d audiobook \
  -c "ALTER TABLE chapters ADD COLUMN IF NOT EXISTS segments TEXT;
      ALTER TABLE chapters ADD COLUMN IF NOT EXISTS emotional_arc TEXT;"
```

Ha a konténer neve más, ellenőrizd: `docker ps | grep postgres`

**Step 4: Ellenőrizd hogy a tesztek még passnak**

```bash
pytest tests/ -v
```

A tesztek SQLite create_all-t használnak, az új nullable oszlopok automatikusan létrejönnek.

**Step 5: Commit**

```bash
git add backend/app/models.py
git commit -m "feat: add segments and emotional_arc columns to chapters"
```

---

### Task 4: Worker integráció — normalizált szöveg + szegmensek mentése

**Fájl:** `backend/app/worker.py` (módosítás) és `backend/app/routers/books.py`

**Step 1: Olvasd el a books.py router-t**

```bash
cat backend/app/routers/books.py
```

Keresd azt a helyet, ahol az EPUB parse után `Chapter` objektumokat mentesz. Valahol itt:
```python
chapters.append({"chapter_number": ..., "title": ..., "text": ..., "word_count": ...})
```

**Step 2: Módosítsd a books.py-t — mentsd a segments JSON-t**

Ahol a `Chapter` objektumot létrehozod, add hozzá:

```python
import json
# ...
db_chapter = Chapter(
    book_id=db_book.id,
    chapter_number=ch["chapter_number"],
    title=ch["title"],
    text_content=ch["text"],
    word_count=ch["word_count"],
    segments=json.dumps(ch.get("segments", []), ensure_ascii=False),
)
```

**Step 3: Módosítsd a worker.py-t — normalizált szöveget használjon**

A `generate_tts` függvényben, ahol `chapter.text_content`-et adod át a TTS-nek:

```python
import json
# A chapter betöltése után, TTS hívás előtt:
if chapter.segments:
    raw_segments = json.loads(chapter.segments)
    # Nem-heading szegmensek szövegei, sorban
    tts_text = " ".join(
        s["text"] for s in raw_segments if not s.get("is_heading")
    )
else:
    tts_text = chapter.text_content

# Majd tts.generate hívásban text=tts_text helyett:
_, timing_data = await loop.run_in_executor(
    None,
    functools.partial(
        tts.generate,
        text=tts_text,  # <-- ez volt chapter.text_content
        reference_clip=ref_clip,
        output_path=output_path,
        language=voice.language,
        on_progress=on_chunk_progress,
    ),
)
```

**Step 4: Futtatsd a worker tesztjét**

```bash
pytest tests/test_voice_pipeline.py tests/test_books_api.py -v
```

**Step 5: Commit**

```bash
git add backend/app/routers/books.py backend/app/worker.py
git commit -m "feat: persist chapter segments and use normalized text in TTS worker"
```

---

## Phase 1B: Érzelem-bank (párhuzamosan futtatható Phase 1A-val)

**Scope:** Hangrögzítő UI a voices oldalon, ahol a felhasználó 6 érzelmi kategóriához tölthet fel hangmintát vagy rögzít közvetlenül a böngészőben.

**Érintett fájlok:**
- Módosítandó: `backend/app/models.py`
- Módosítandó: `backend/app/schemas.py`
- Módosítandó: `backend/app/routers/voices.py`
- Létrehozandó: `frontend/src/components/EmotionBankRecorder.tsx`
- Módosítandó: `frontend/src/app/voices/page.tsx`
- Módosítandó: `frontend/src/lib/api.ts`

**Az 6 érzelem-kategória (MVP):**

| Kulcs | Magyar név | Előolvasandó szöveg |
|-------|-----------|---------------------|
| `neutral` | Semleges narráció | "A szobában csend volt. Az ablakon átszűrődő fény lassan kúszott végig a padlón, és minden úgy állt, ahogy előző este hagyta." |
| `happy` | Örömteli | "Végre megérkeztek! Azt hitte, ez a nap soha nem jön el, mégis itt álltak, ragyogó arccal, tele nevetéssel és izgalommal." |
| `sad` | Szomorú | "Nem értette, hogyan lehet valaki egyszerre ilyen közel és ilyen messze. A levelek ott hevertek az asztalon, olvasatlanul." |
| `tense` | Feszült | "Valaki a folyosón volt. A lélegzetét visszafojtva figyelt — egy lépés, aztán csend. Aztán megint egy lépés, közelebb." |
| `angry` | Dühös | "Elege lett. Minden egyes alkalommal ugyanez történt, és most már nem volt hajlandó szó nélkül elmenni mellette." |
| `whisper` | Suttogó | "Hallod? — suttogta, és közelebb hajolt. — Ne mondd senkinek. Ez csak közöttünk marad, rendben?" |

---

### Task 5: Voice model — emotion_bank mező + séma frissítés

**Step 1: Olvasd el a models.py-t és schemas.py-t**

**Step 2: Adj hozzá mezőt a Voice modellhez**

`backend/app/models.py`, a `Voice` osztályban a `created_at` sor előtt:

```python
emotion_bank: Mapped[str | None] = mapped_column(Text, nullable=True)
# JSON: {"neutral": "storage/voices/...", "happy": "...", "sad": "...", ...}
```

**Step 3: Frissítsd a VoiceOut sémát**

`backend/app/schemas.py`, a `VoiceOut` osztályban add hozzá:

```python
emotion_bank: str | None = None  # JSON string
```

**Step 4: DB migráció**

```bash
docker exec -it audiobook-db psql -U audiobook -d audiobook \
  -c "ALTER TABLE voices ADD COLUMN IF NOT EXISTS emotion_bank TEXT;"
```

**Step 5: Tesztek futtatása**

```bash
pytest tests/test_voices_api.py -v
```

**Step 6: Commit**

```bash
git add backend/app/models.py backend/app/schemas.py
git commit -m "feat: add emotion_bank column to voices"
```

---

### Task 6: Backend API — érzelem klip feltöltés/törlés

**Fájl:** `backend/app/routers/voices.py` (módosítás)

**Step 1: Olvasd el a voices.py-t**

Különösen a `convert_to_wav` és `to_relative_path` helper függvényeket — ezeket újra fogod használni.

**Step 2: Írj failing API tesztet**

`backend/tests/test_voices_api.py`-ba add hozzá:

```python
import io
import pytest


async def test_upload_emotion_clip(client, db_session):
    from app.models import Voice
    voice = Voice(name="Test", language="hu")
    db_session.add(voice)
    await db_session.commit()
    await db_session.refresh(voice)

    fake_wav = b"RIFF" + b"\x00" * 36  # minimal WAV header stub
    response = await client.post(
        f"/api/voices/{voice.id}/emotion-clips/neutral",
        files={"file": ("test.wav", io.BytesIO(fake_wav), "audio/wav")},
    )
    # ffmpeg conversion will fail with stub WAV, so we expect 400 or 200
    assert response.status_code in (200, 400)


async def test_upload_invalid_emotion(client, db_session):
    from app.models import Voice
    voice = Voice(name="Test", language="hu")
    db_session.add(voice)
    await db_session.commit()
    await db_session.refresh(voice)

    fake_wav = b"RIFF" + b"\x00" * 36
    response = await client.post(
        f"/api/voices/{voice.id}/emotion-clips/invalid_emotion",
        files={"file": ("test.wav", io.BytesIO(fake_wav), "audio/wav")},
    )
    assert response.status_code == 422


async def test_get_emotion_texts(client):
    response = await client.get("/api/voices/emotion-texts")
    assert response.status_code == 200
    data = response.json()
    assert "neutral" in data
    assert "happy" in data
```

**Step 3: Add hozzá az endpointokat a voices.py-hoz**

A `@router.delete` előtt illeszd be:

```python
import json
from typing import Literal

EMOTION_CATEGORIES = Literal["neutral", "happy", "sad", "tense", "angry", "whisper"]

EMOTION_TEXTS = {
    "neutral": "A szobában csend volt. Az ablakon átszűrődő fény lassan kúszott végig a padlón, és minden úgy állt, ahogy előző este hagyta.",
    "happy": "Végre megérkeztek! Azt hitte, ez a nap soha nem jön el, mégis itt álltak, ragyogó arccal, tele nevetéssel és izgalommal.",
    "sad": "Nem értette, hogyan lehet valaki egyszerre ilyen közel és ilyen messze. A levelek ott hevertek az asztalon, olvasatlanul.",
    "tense": "Valaki a folyosón volt. A lélegzetét visszafojtva figyelt — egy lépés, aztán csend. Aztán megint egy lépés, közelebb.",
    "angry": "Elege lett. Minden egyes alkalommal ugyanez történt, és most már nem volt hajlandó szó nélkül elmenni mellette.",
    "whisper": "Hallod? — suttogta, és közelebb hajolt. — Ne mondd senkinek. Ez csak közöttünk marad, rendben?",
}


@router.get("/emotion-texts")
async def get_emotion_texts():
    """Return the prewritten texts for each emotion category."""
    return EMOTION_TEXTS


@router.post("/{voice_id}/emotion-clips/{emotion}", response_model=VoiceOut)
async def upload_emotion_clip(
    voice_id: int,
    emotion: EMOTION_CATEGORIES,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
):
    """Upload or record an audio clip for a specific emotion category."""
    result = await db.execute(select(Voice).where(Voice.id == voice_id))
    voice = result.scalar_one_or_none()
    if not voice:
        raise HTTPException(404, "Voice not found")

    filename = file.filename or "clip.wav"
    ext = Path(filename).suffix.lower()
    if ext not in ALLOWED_AUDIO_EXTENSIONS:
        raise HTTPException(400, f"Unsupported format. Allowed: {', '.join(ALLOWED_AUDIO_EXTENSIONS)}")

    settings.voices_path.mkdir(parents=True, exist_ok=True)
    upload_path = settings.voices_path / f"voice_{voice_id}_emo_{emotion}_upload{ext}"
    with open(upload_path, "wb") as f:
        shutil.copyfileobj(file.file, f)

    clip_path = settings.voices_path / f"voice_{voice_id}_emo_{emotion}.wav"
    convert_to_wav(upload_path, clip_path)

    # Update emotion_bank JSON
    bank = json.loads(voice.emotion_bank) if voice.emotion_bank else {}
    bank[emotion] = to_relative_path(clip_path)
    voice.emotion_bank = json.dumps(bank)

    await db.commit()
    await db.refresh(voice)
    return voice


@router.delete("/{voice_id}/emotion-clips/{emotion}", response_model=VoiceOut)
async def delete_emotion_clip(
    voice_id: int,
    emotion: EMOTION_CATEGORIES,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Voice).where(Voice.id == voice_id))
    voice = result.scalar_one_or_none()
    if not voice:
        raise HTTPException(404, "Voice not found")

    if voice.emotion_bank:
        bank = json.loads(voice.emotion_bank)
        clip_rel = bank.pop(emotion, None)
        voice.emotion_bank = json.dumps(bank)
        await db.commit()
        # Remove file
        if clip_rel:
            clip_path = BACKEND_ROOT / clip_rel
            if clip_path.exists():
                clip_path.unlink()

    await db.refresh(voice)
    return voice
```

**Fontos:** A `EMOTION_CATEGORIES` `Literal` típust **a `@router.delete` ELŐTT** kell definiálni, és az új `get_emotion_texts` route-ot **az összes `/{voice_id}/...` route ELÉ** kell tenni, különben a `/emotion-texts` útvonalat a FastAPI `{voice_id}`-ként kezeli.

**Step 4: Futtasd a teszteket**

```bash
pytest tests/test_voices_api.py -v
```

**Step 5: Commit**

```bash
git add backend/app/routers/voices.py backend/tests/test_voices_api.py
git commit -m "feat: emotion clip upload/delete API and emotion texts endpoint"
```

---

### Task 7: EmotionBankRecorder frontend komponens

**Fájl:** `frontend/src/components/EmotionBankRecorder.tsx` (új fájl)

Ez egy React komponens, ami:
1. Megmutatja a 6 érzelem kártyáját, mindegyikhez az előolvasandó szöveggel
2. Minden kártyán: "Feltöltés" gomb (fájl) + "Felvétel" gomb (mikrofon)
3. Felvétel közben visszaszámláló, majd automatikus feltöltés
4. Zöld pipa, ha a klipen már van felvétel

**Step 1: Frissítsd a frontend API klienst**

`frontend/src/lib/api.ts`-be add hozzá:

```typescript
export const EMOTION_LABELS: Record<string, string> = {
  neutral: "Semleges narráció",
  happy: "Örömteli",
  sad: "Szomorú",
  tense: "Feszült",
  angry: "Dühös",
  whisper: "Suttogó",
};

export async function getEmotionTexts(): Promise<Record<string, string>> {
  const res = await fetch(`${API_BASE}/api/voices/emotion-texts`);
  if (!res.ok) throw new Error("Failed to fetch emotion texts");
  return res.json();
}

export async function uploadEmotionClip(
  voiceId: number,
  emotion: string,
  file: Blob,
  filename: string = "recording.wav"
): Promise<void> {
  const form = new FormData();
  form.append("file", file, filename);
  const res = await fetch(`${API_BASE}/api/voices/${voiceId}/emotion-clips/${emotion}`, {
    method: "POST",
    body: form,
  });
  if (!res.ok) throw new Error(`Upload failed: ${res.statusText}`);
}

export async function deleteEmotionClip(voiceId: number, emotion: string): Promise<void> {
  const res = await fetch(`${API_BASE}/api/voices/${voiceId}/emotion-clips/${emotion}`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error(`Delete failed: ${res.statusText}`);
}
```

Ahol `API_BASE` az alap URL — nézd meg hogyan van definiálva a meglévő api.ts-ben, és kövesd ugyanazt a mintát.

**Step 2: Hozd létre a komponenst**

`frontend/src/components/EmotionBankRecorder.tsx`:

```tsx
"use client";
import { useEffect, useRef, useState } from "react";
import { getEmotionTexts, uploadEmotionClip, deleteEmotionClip, EMOTION_LABELS } from "@/lib/api";

interface EmotionBankRecorderProps {
  voiceId: number;
  emotionBank: Record<string, string>;
  onUpdate: () => void;
}

const EMOTIONS = ["neutral", "happy", "sad", "tense", "angry", "whisper"];

export function EmotionBankRecorder({ voiceId, emotionBank, onUpdate }: EmotionBankRecorderProps) {
  const [emotionTexts, setEmotionTexts] = useState<Record<string, string>>({});
  const [recording, setRecording] = useState<string | null>(null);
  const [countdown, setCountdown] = useState(0);
  const [uploading, setUploading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  useEffect(() => {
    getEmotionTexts().then(setEmotionTexts).catch(console.error);
  }, []);

  async function startRecording(emotion: string) {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream, { mimeType: "audio/webm" });
      chunksRef.current = [];
      mr.ondataavailable = (e) => chunksRef.current.push(e.data);
      mr.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        await handleUpload(emotion, blob, "recording.webm");
      };
      mediaRecorderRef.current = mr;
      mr.start();
      setRecording(emotion);

      // 10 second countdown then auto-stop
      let secs = 10;
      setCountdown(secs);
      const timer = setInterval(() => {
        secs--;
        setCountdown(secs);
        if (secs <= 0) {
          clearInterval(timer);
          mr.stop();
          setRecording(null);
        }
      }, 1000);
    } catch {
      setError("Mikrofon hozzáférés megtagadva. Engedélyezd a böngészőben.");
    }
  }

  function stopRecording() {
    mediaRecorderRef.current?.stop();
    setRecording(null);
    setCountdown(0);
  }

  async function handleUpload(emotion: string, blob: Blob, filename: string) {
    setUploading(emotion);
    try {
      await uploadEmotionClip(voiceId, emotion, blob, filename);
      onUpdate();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Feltöltés sikertelen");
    } finally {
      setUploading(null);
    }
  }

  async function handleFileChange(emotion: string, e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    await handleUpload(emotion, file, file.name);
    e.target.value = "";
  }

  async function handleDelete(emotion: string) {
    try {
      await deleteEmotionClip(voiceId, emotion);
      onUpdate();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Törlés sikertelen");
    }
  }

  return (
    <div className="space-y-3">
      <h3 className="font-semibold text-sm text-gray-700">Érzelem-bank hangminták</h3>
      {error && (
        <div className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded">{error}</div>
      )}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {EMOTIONS.map((emotion) => {
          const hasClip = Boolean(emotionBank[emotion]);
          const isRecording = recording === emotion;
          const isUploading = uploading === emotion;

          return (
            <div
              key={emotion}
              className={`rounded-lg border p-3 text-sm ${hasClip ? "border-green-300 bg-green-50" : "border-gray-200 bg-white"}`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="font-medium">
                  {hasClip && <span className="text-green-600 mr-1">✓</span>}
                  {EMOTION_LABELS[emotion]}
                </span>
                {hasClip && (
                  <button
                    onClick={() => handleDelete(emotion)}
                    className="text-xs text-red-500 hover:text-red-700"
                  >
                    Töröl
                  </button>
                )}
              </div>
              {emotionTexts[emotion] && (
                <p className="text-xs text-gray-500 italic mb-2 line-clamp-2">
                  {emotionTexts[emotion]}
                </p>
              )}
              <div className="flex gap-2">
                <button
                  disabled={isRecording || isUploading}
                  onClick={() => fileInputRefs.current[emotion]?.click()}
                  className="flex-1 rounded border border-gray-300 px-2 py-1 text-xs hover:bg-gray-50 disabled:opacity-50"
                >
                  Feltöltés
                </button>
                <input
                  ref={(el) => { fileInputRefs.current[emotion] = el; }}
                  type="file"
                  accept="audio/*"
                  className="hidden"
                  onChange={(e) => handleFileChange(emotion, e)}
                />
                {isRecording ? (
                  <button
                    onClick={stopRecording}
                    className="flex-1 rounded bg-red-500 text-white px-2 py-1 text-xs animate-pulse"
                  >
                    Stop ({countdown}s)
                  </button>
                ) : (
                  <button
                    disabled={isUploading}
                    onClick={() => startRecording(emotion)}
                    className="flex-1 rounded bg-indigo-600 text-white px-2 py-1 text-xs hover:bg-indigo-700 disabled:opacity-50"
                  >
                    {isUploading ? "Feltöltés..." : "Felvétel"}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
```

**Step 3: Commit**

```bash
git add frontend/src/components/EmotionBankRecorder.tsx frontend/src/lib/api.ts
git commit -m "feat: EmotionBankRecorder component with file upload and MediaRecorder"
```

---

### Task 8: Voices oldal integráció

**Fájl:** `frontend/src/app/voices/page.tsx` (módosítás)

**Step 1: Olvasd el a jelenlegi voices/page.tsx-t**

Értsd meg hogyan tölti be és jeleníti meg a hangokat.

**Step 2: Integráld az EmotionBankRecorder-t**

Ahol a hangok listáját jeleníteted meg (valószínűleg egy `.map()` iteráció a voice-okon), add hozzá minden hanghoz a `EmotionBankRecorder` komponenst:

```tsx
import { EmotionBankRecorder } from "@/components/EmotionBankRecorder";

// Ahol a voice detail panel van, pl. egy kijelölt hangnál:
{selectedVoice && (
  <EmotionBankRecorder
    voiceId={selectedVoice.id}
    emotionBank={
      selectedVoice.emotion_bank
        ? JSON.parse(selectedVoice.emotion_bank)
        : {}
    }
    onUpdate={refreshVoices}  // a meglévő list refresh függvény
  />
)}
```

Ha nincs "kijelölt hang" állapot, egyszerűen minden hangkártya alatt jelenítsd meg.

**Step 3: Ellenőrizd a böngészőben**

```bash
cd frontend && npm run dev
```

Menj a `/voices` oldalra, és teszteld a feltöltést + felvételt.

**Step 4: Commit**

```bash
git add frontend/src/app/voices/page.tsx
git commit -m "feat: integrate EmotionBankRecorder into voices page"
```

---

## Phase 2: LLM Annotátor (Ollama + Qwen2.5)

**Scope:** Lokális LLM-mel fejezet-szintű érzelmi ív elemzés és szegmens-szintű annotáció.

**Előfeltétel:** Ollama fut a gépen (`ollama serve`), és le van töltve a modell:
```bash
ollama pull qwen2.5:7b-instruct
```

**Érintett fájlok:**
- Létrehozandó: `backend/app/services/llm_annotator.py`
- Módosítandó: `backend/app/worker.py`
- Módosítandó: `backend/app/config.py`
- Létrehozandó: `backend/tests/test_llm_annotator.py`

---

### Task 9: Ollama service — llm_annotator.py

**Step 1: Frissítsd a config.py-t**

`backend/app/config.py`-ban add hozzá a Settings osztályhoz:

```python
ollama_url: str = "http://localhost:11434"
ollama_model: str = "qwen2.5:7b-instruct"
```

**Step 2: Írj failing teszteket**

`backend/tests/test_llm_annotator.py`:

```python
import pytest
from unittest.mock import patch, AsyncMock
from app.services.llm_annotator import LLMAnnotator, EmotionalArc


def test_emotional_arc_defaults():
    arc = EmotionalArc(dominant_emotion="neutral", pacing="medium", intensity=5)
    assert arc.narrator_note == ""


@pytest.mark.asyncio
async def test_analyze_chapter_arc_returns_arc():
    annotator = LLMAnnotator(base_url="http://localhost:11434", model="test-model")
    mock_response = {
        "dominant_emotion": "tense",
        "pacing": "fast",
        "intensity": 8,
        "narrator_note": "Feszült jelenet, lassíts a csúcspont előtt.",
    }
    with patch.object(annotator, "_call_ollama", new_callable=AsyncMock) as mock_call:
        mock_call.return_value = mock_response
        arc = await annotator.analyze_chapter_arc("Szöveg itt...")
    assert arc.dominant_emotion == "tense"
    assert arc.intensity == 8


@pytest.mark.asyncio
async def test_analyze_chapter_arc_fallback_on_error():
    annotator = LLMAnnotator(base_url="http://localhost:11434", model="test-model")
    with patch.object(annotator, "_call_ollama", new_callable=AsyncMock) as mock_call:
        mock_call.side_effect = Exception("Ollama not running")
        arc = await annotator.analyze_chapter_arc("Szöveg itt...")
    assert arc.dominant_emotion == "neutral"  # fallback
```

**Step 3: Futtasd, ellenőrizd fail**

```bash
pytest tests/test_llm_annotator.py -v
```

**Step 4: Implementáld a modult**

`backend/app/services/llm_annotator.py`:

```python
import json
import logging
from dataclasses import dataclass, field
import httpx

logger = logging.getLogger(__name__)

CHAPTER_ARC_PROMPT = """\
Hangoskönyv-rendező vagy. Elemezd a regényfejezet alábbi részletét, \
és adj vissza JSON objektumot az alábbi mezőkkel:
- dominant_emotion: az egyik: neutral, happy, sad, tense, angry, whisper
- pacing: az egyik: slow, medium, fast
- intensity: egész szám 1-10 között
- narrator_note: egy mondat magyarul a narrátornak útmutatásként

Csak valid JSON-t adj vissza, más szöveget nem!

Fejezet szövege (első 2000 karakter):
{chapter_text}
"""


@dataclass
class EmotionalArc:
    dominant_emotion: str = "neutral"
    pacing: str = "medium"
    intensity: int = 5
    narrator_note: str = ""


class LLMAnnotator:
    def __init__(self, base_url: str, model: str):
        self.base_url = base_url
        self.model = model

    async def _call_ollama(self, prompt: str) -> dict:
        """Call Ollama API and parse JSON response."""
        async with httpx.AsyncClient(timeout=60.0) as client:
            response = await client.post(
                f"{self.base_url}/api/generate",
                json={
                    "model": self.model,
                    "prompt": prompt,
                    "stream": False,
                    "format": "json",
                },
            )
            response.raise_for_status()
            data = response.json()
            return json.loads(data["response"])

    async def analyze_chapter_arc(self, chapter_text: str) -> EmotionalArc:
        """Analyze the emotional arc of a chapter. Returns fallback on error."""
        prompt = CHAPTER_ARC_PROMPT.format(chapter_text=chapter_text[:2000])
        try:
            result = await self._call_ollama(prompt)
            return EmotionalArc(
                dominant_emotion=result.get("dominant_emotion", "neutral"),
                pacing=result.get("pacing", "medium"),
                intensity=int(result.get("intensity", 5)),
                narrator_note=result.get("narrator_note", ""),
            )
        except Exception as e:
            logger.warning(f"LLM annotation failed, using fallback: {e}")
            return EmotionalArc()
```

**Step 5: Futtasd a teszteket**

```bash
pytest tests/test_llm_annotator.py -v
```

Várt: `3 passed`

**Step 6: Commit**

```bash
git add backend/app/services/llm_annotator.py backend/tests/test_llm_annotator.py backend/app/config.py
git commit -m "feat: LLM annotator with Ollama integration and graceful fallback"
```

---

### Task 10: Worker integráció — LLM annotáció a TTS job előtt

**Fájl:** `backend/app/worker.py` (módosítás)

**Step 1: Módosítsd a `startup` függvényt**

Az `LLMAnnotator`-t a startup-ban kell inicializálni (nem job-onként, hogy ne kelljen újra létrehozni):

```python
from app.services.llm_annotator import LLMAnnotator
from app.config import settings

async def startup(ctx):
    # ... meglévő kód ...
    ctx["llm_annotator"] = LLMAnnotator(
        base_url=settings.ollama_url,
        model=settings.ollama_model,
    )
```

**Step 2: Módosítsd a `generate_tts` függvényt**

A chapter betöltése után, de a TTS generálás előtt add hozzá:

```python
annotator: LLMAnnotator = ctx.get("llm_annotator")

# Fejezet-szintű érzelmi ív elemzés (ha még nincs)
if annotator and not chapter.emotional_arc:
    logger.info(f"Job {job_id}: Running LLM arc analysis...")
    arc = await annotator.analyze_chapter_arc(chapter.text_content)
    import json
    chapter.emotional_arc = json.dumps({
        "dominant_emotion": arc.dominant_emotion,
        "pacing": arc.pacing,
        "intensity": arc.intensity,
        "narrator_note": arc.narrator_note,
    })
    await db.commit()
    logger.info(f"Job {job_id}: Arc: {arc.dominant_emotion} | intensity={arc.intensity}")
```

**Step 3: Futtasd a meglévő worker teszteket**

```bash
pytest tests/test_jobs_api.py -v
```

**Step 4: Commit**

```bash
git add backend/app/worker.py
git commit -m "feat: run LLM chapter arc analysis before TTS generation"
```

---

## Phase 3: Okos TTS Generálás

**Scope:** Az érzelem-bank referencia klipjeit használja a TTS engine, kalibrált szünetekkel szegmensek között.

**Érintett fájlok:**
- Módosítandó: `backend/app/services/tts_engine.py`
- Módosítandó: `backend/app/worker.py`
- Módosítandó: `backend/requirements-worker.txt`

---

### Task 11: Pydub telepítés + kalibrált szünetek

**Step 1: Add hozzá a pydub-ot**

`backend/requirements-worker.txt`-be:

```
pydub==0.25.1
```

Majd:
```bash
cd backend && source .venv/bin/activate && pip install pydub==0.25.1
```

**Step 2: Írj failing tesztet**

`backend/tests/test_voice_pipeline.py`-ba (vagy új `test_tts_engine.py`-ba):

```python
from app.services.tts_engine import build_pause_between


def test_pause_dialogue_to_narration():
    ms = build_pause_between("dialogue", "narration")
    assert ms == 600


def test_pause_heading():
    ms = build_pause_between("heading", "narration")
    assert ms == 1500


def test_pause_default():
    ms = build_pause_between("narration", "narration")
    assert ms == 500
```

**Step 3: Futtasd, ellenőrizd fail**

```bash
pytest tests/ -k "pause" -v
```

**Step 4: Add hozzá a `build_pause_between` függvényt a tts_engine.py-hoz**

`backend/app/services/tts_engine.py`, az osztályon kívül:

```python
PAUSE_MS = {
    ("dialogue", "narration"): 600,
    ("narration", "dialogue"): 300,
    ("heading", "narration"): 1500,
    ("heading", "dialogue"): 1500,
    ("action", "narration"): 200,
    ("action", "dialogue"): 200,
}
DEFAULT_PAUSE_MS = 500


def build_pause_between(prev_type: str, next_type: str) -> int:
    return PAUSE_MS.get((prev_type, next_type), DEFAULT_PAUSE_MS)
```

**Step 5: Frissítsd a `_concatenate_audio` metódust szegmens-szünetekkel**

A `TTSEngine` osztályban módosítsd a `_concatenate_audio` metódust:

```python
def _concatenate_audio(self, paths: list[Path], output: Path, seg_types: list[str] | None = None):
    """Concatenate WAV files using pydub with calibrated pauses between segments."""
    from pydub import AudioSegment as PydubAudio

    result = PydubAudio.empty()
    for i, path in enumerate(paths):
        segment = PydubAudio.from_wav(str(path))
        result += segment
        if i < len(paths) - 1:
            if seg_types and i + 1 < len(seg_types):
                pause_ms = build_pause_between(seg_types[i], seg_types[i + 1])
            else:
                pause_ms = DEFAULT_PAUSE_MS
            result += PydubAudio.silent(duration=pause_ms)

    result.export(str(output), format="wav")
```

**Step 6: Futtasd a teszteket**

```bash
pytest tests/ -v
```

**Step 7: Commit**

```bash
git add backend/app/services/tts_engine.py backend/requirements-worker.txt
git commit -m "feat: calibrated pauses between segments using pydub"
```

---

### Task 12: Érzelem-bank alapú referencia klip kiválasztás

**Fájl:** `backend/app/services/tts_engine.py` és `backend/app/worker.py`

**Step 1: Írj failing tesztet**

```python
from app.services.tts_engine import select_reference_clip
from pathlib import Path


def test_select_matching_emotion():
    bank = {"neutral": "voices/neutral.wav", "sad": "voices/sad.wav"}
    result = select_reference_clip(bank, "sad", default="voices/neutral.wav")
    assert result == Path("voices/sad.wav")


def test_select_fallback_to_neutral():
    bank = {"neutral": "voices/neutral.wav"}
    result = select_reference_clip(bank, "tense", default="voices/neutral.wav")
    assert result == Path("voices/neutral.wav")


def test_select_fallback_to_default():
    bank = {}
    result = select_reference_clip(bank, "sad", default="voices/fallback.wav")
    assert result == Path("voices/fallback.wav")
```

**Step 2: Futtasd, ellenőrizd fail**

```bash
pytest tests/ -k "reference_clip" -v
```

**Step 3: Add hozzá a `select_reference_clip` függvényt a tts_engine.py-hoz**

```python
# Érzelem-rokonság: ha nincs pontos egyezés, közeli érzelemhez fallback
EMOTION_FALLBACK = {
    "tense": "neutral",
    "angry": "tense",
    "whisper": "sad",
    "happy": "neutral",
}


def select_reference_clip(emotion_bank: dict, emotion: str, default: str) -> Path:
    """Select the best matching reference clip from emotion bank."""
    if emotion in emotion_bank:
        return Path(emotion_bank[emotion])
    fallback_emotion = EMOTION_FALLBACK.get(emotion, "neutral")
    if fallback_emotion in emotion_bank:
        return Path(emotion_bank[fallback_emotion])
    if "neutral" in emotion_bank:
        return Path(emotion_bank["neutral"])
    return Path(default)
```

**Step 4: Frissítsd a worker.py-t — érzelem-bank alapú ref clip**

A `generate_tts` függvényben, ahol az `output_path`-t és `ref_clip`-et meghatározod:

```python
import json as _json

# Érzelem-bank betöltése
emotion_bank = _json.loads(voice.emotion_bank) if voice.emotion_bank else {}

# Érzelmi ív kinyerése (ha van LLM annotáció)
dominant_emotion = "neutral"
if chapter.emotional_arc:
    arc_data = _json.loads(chapter.emotional_arc)
    dominant_emotion = arc_data.get("dominant_emotion", "neutral")

# Referencia klip kiválasztása
from app.services.tts_engine import select_reference_clip
ref_clip = select_reference_clip(
    emotion_bank=emotion_bank,
    emotion=dominant_emotion,
    default=str(ref_clip),  # az eredeti reference_clip_path mint végső fallback
)

# Ha az emotion bank-ból jött és relatív, rezolváld
if not ref_clip.is_absolute():
    ref_clip = BACKEND_ROOT / ref_clip
if not ref_clip.exists():
    raise ValueError(f"Reference clip not found: {ref_clip}")
```

**Step 5: Futtasd az összes tesztet**

```bash
pytest tests/ -v
```

**Step 6: Commit**

```bash
git add backend/app/services/tts_engine.py backend/app/worker.py
git commit -m "feat: emotion-bank based reference clip selection in TTS worker"
```

---

### Task 13: Post-processing — EBU R128 normalizálás

**Fájl:** `backend/app/services/tts_engine.py` (módosítás)

Ez a lépés a generált WAV-ot normalizálja az iparági hangoskönyv standardhez (-18 LUFS, True Peak -1.5 dBTP).

**Előfeltétel:** `pip install ffmpeg-normalize`

**Step 1: Add hozzá a függőséget**

`backend/requirements-worker.txt`:
```
ffmpeg-normalize==1.31.0
```

```bash
pip install ffmpeg-normalize==1.31.0
```

**Step 2: Írj failing tesztet**

```python
from unittest.mock import patch
from pathlib import Path
from app.services.tts_engine import normalize_audio_ebu_r128


def test_normalize_calls_ffmpeg(tmp_path):
    input_wav = tmp_path / "input.wav"
    input_wav.write_bytes(b"fake")
    output_wav = tmp_path / "output.wav"

    with patch("subprocess.run") as mock_run:
        mock_run.return_value.returncode = 0
        normalize_audio_ebu_r128(input_wav, output_wav)
        assert mock_run.called
        cmd = mock_run.call_args[0][0]
        assert "ffmpeg-normalize" in cmd[0] or "ffmpeg-normalize" in " ".join(cmd)
```

**Step 3: Implementáld a normalizálást**

`backend/app/services/tts_engine.py`-ban, az osztályon kívül:

```python
import subprocess


def normalize_audio_ebu_r128(input_path: Path, output_path: Path) -> Path:
    """Normalize audio to audiobook standard: -18 LUFS, True Peak -1.5 dBTP."""
    subprocess.run(
        [
            "ffmpeg-normalize", str(input_path),
            "-o", str(output_path),
            "--loudness-range-target", "7",
            "--target-level", "-18",
            "--true-peak", "-1.5",
            "--audio-codec", "pcm_s16le",
            "-f",
        ],
        check=True,
        capture_output=True,
    )
    return output_path
```

**Step 4: Futtasd a teszteket**

```bash
pytest tests/ -v
```

**Step 5: Integráld a worker.py-ba (opcionális post-processing lépés)**

A `job.status = "done"` beállítása előtt:

```python
from app.services.tts_engine import normalize_audio_ebu_r128

# Post-processing (EBU R128 normalizálás)
try:
    normalized_path = output_path.parent / f"{output_path.stem}_norm.wav"
    normalize_audio_ebu_r128(output_path, normalized_path)
    output_path.unlink()
    normalized_path.rename(output_path)
    logger.info(f"Job {job_id}: EBU R128 normalization complete")
except Exception as e:
    logger.warning(f"Job {job_id}: Normalization failed (non-fatal): {e}")
    # Nem fatális hiba — az eredeti WAV marad
```

**Step 6: Commit**

```bash
git add backend/app/services/tts_engine.py backend/app/worker.py backend/requirements-worker.txt
git commit -m "feat: EBU R128 loudness normalization post-processing"
```

---

## Összefoglalás: Phase sorrend és függőségek

```
Phase 1A (Szöveg pipeline)     ─── 1 hét
  Task 1: text_normalizer.py
  Task 2: epub_parser DOM walker
  Task 3: Chapter.segments mező
  Task 4: Worker integráció

Phase 1B (Érzelem-bank UI)     ─── párhuzamosan 1B-vel, 1 hét
  Task 5: Voice.emotion_bank mező
  Task 6: Backend API
  Task 7: EmotionBankRecorder komponens
  Task 8: Voices page integráció

Phase 2 (LLM Annotátor)        ─── Phase 1A után, 1.5 hét
  Task 9: llm_annotator.py
  Task 10: Worker integráció

Phase 3 (Okos TTS)             ─── Phase 1B + Phase 2 után, 1 hét
  Task 11: Kalibrált szünetek (pydub)
  Task 12: Érzelem-bank ref clip kiválasztás
  Task 13: EBU R128 normalizálás
```

**Gyors teszt-parancs az összes phase után:**

```bash
cd backend && source .venv/bin/activate
pytest tests/ -v --tb=short
```

**Várható javulás Phase 3 után:**
- Természetesebb szünetek jelenetváltásnál (+++ hangélmény)
- Hangulatilag illeszkedő referencia klip fejezetenként
- Konzisztens hangerő (-18 LUFS audiobook standard)
- Normalizált, hibás tipográfiától mentes TTS input
