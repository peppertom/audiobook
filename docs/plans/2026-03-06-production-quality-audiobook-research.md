# Csúcsminőségű Hangoskönyv Gyártás — Kutatás és Tervezés

**Dátum**: 2026-03-06
**Státusz**: Ideation / Research
**Cél**: A jelenlegi XTTS-v2 pipeline fejlesztése szinkronszínész szintű érzelmi kifejezőképességre

---

## Összefoglalás

A jelenlegi rendszer nyers szövegből egyetlen referencia klip segítségével generál hangot — ez lapos, érzelem nélküli eredményt ad. A szinkronszínész szintű minőséghez **három fő fejlesztési réteg** szükséges:

1. **Szöveg előfeldolgozás**: az EPUB-ból strukturált, annotált szegmenseket kinyerni (narráció / dialógus / belső monológ / akció)
2. **Érzelmi TTS vezérlés**: megfelelő referencia klipet vagy érzelem-tageket alkalmazni szegmensenként
3. **Audio utófeldolgozás**: természetes szünetek, hangerő normalizálás, fejezet-metaadatok

---

## 1. Az XTTS-v2 Korlátai és Megkerülési Stratégiák

### Hogyan kezeli az XTTS-v2 az érzelmeket?

Az XTTS-v2 **referencia audio kondicionálást** alkalmaz — nem fogad el SSML vagy érzelem tageket. A modell a referencia klip prozódiáját (energia, ritmus, intonáció) viszi át a generált hangra.

**Jelenleg**: `tts_engine.py` egyetlen lapos klippel hív minden fejezetre → monoton kimenet.

### A legnagyobb minőségjavítás: Érzelem-szegregált referencia klipek

Egyetlen hang helyett **érzelem-bankot** kell felépíteni ugyanattól a hanganyagtól, különböző regiszterekben rögzítve:

```
storage/voices/{voice_id}/emotion_bank/
  neutral.wav       # alapértelmezett narráció
  sad.wav           # érzelmes jelenet
  excited.wav       # magas energiájú jelenet
  tense.wav         # feszültség / thriller
  warm.wav          # intim / elmélkedő
  dialogue.wav      # párbeszéd jellegű előadás
  formal.wav        # fejezet-cím, ünnepélyes
```

Az XTTS-v2 **lista formájában** is elfogad referencia klipeket — ez lehetővé teszi a kevert érzelmi regisztert:

```python
model.tts_to_file(
    text=chunk,
    speaker_wav=["neutral.wav", "sad.wav"],  # 50-50 keverék
    language="hu",
    file_path=output_path,
)
```

---

## 2. Alternatív / Kiegészítő TTS Motorok

### Orpheus-TTS (legjobb nyílt forrású érzelem expresszivitás)

- **Modell**: Llama-3B alapú, Apache 2.0 licenc
- **Egyedi képessége**: inline érzelem tagek szövegbe ágyazva

```python
text = "Visszanézett a képre. <sigh> Sosem hitte volna, hogy így végződik."
text = "Felkacagott. <laugh> Szóval te voltál az egész idő alatt!"
```

**Támogatott tagek**: `<laugh>`, `<chuckle>`, `<sigh>`, `<cough>`, `<sniffle>`, `<groan>`, `<yawn>`, `<gasp>`

**Javasolt használat**: dialógus-szegmensek esetén (ahol az expresszivitás fontosabb a hangazonosítás-precizitásnál).

**GitHub**: https://github.com/canopyai/Orpheus-TTS

### Parler-TTS (természetes nyelvi stílus leírás)

- **45 000 óra hangoskönyv-adaton** tanítva
- Referencia klip helyett szöveges leírással vezérelhető:

```python
description = "Középkorú férfi narrátor, lassú tempóval, komor, fáradt hangon. Mély hangszín, tiszta stúdióminőség."
```

- `parler-tts-mini-expresso` checkpoint: explicit érzelem kontroll (happy, sad, laughing, confused)
- **Hátránya**: nem csinál zero-shot hangklónozást, csak előtanított hangokat

**GitHub**: https://github.com/huggingface/parler-tts

### CosyVoice 2/3 (legjobb általános expresszivitás 2025-ben)

- Alibaba nyílt forrású, 1,5B paraméter, 1 millió óra edzőanyagon
- Inline érzelem markerek:

```python
text = "Odahajolt hozzá [breath] Azt hittem, sohasem látlak többé. [laughter]"
```

- Vezető teljesítmény keresztnyelvű hangklónozásban és érzelmi hűségben
- **GitHub**: https://github.com/FunAudioLLM/CosyVoice

### Hibrid stratégia (ajánlott)

```
Narráció → XTTS-v2 (pontos hangklónozás, stabil minőség)
Dialógus → Orpheus-TTS (természetes expresszivitás, érzelem tagek)
Fejezet-cím → XTTS-v2 formal.wav referenciával
```

---

## 3. Szöveg Előfeldolgozás — A Pipeline Szíve

### Szegmens Típusok és TTS Kezelésük

| Típus | Felismerés | TTS Kezelés |
|-------|-----------|-------------|
| Narráció | alapértelmezett | stabil tempó, neutral-warm |
| Dialógus | `„..."` `"..."` idézőjel | karakter hang, gyorsabb |
| Belső monológ | `<em>` / dőlt betű az EPUB-ban | halkabb, introspeketív |
| Akció-beat | rövid mondat + fizikai ige | rövidebb szünet előtte, pattogós |
| Leíró rész | hosszú mondat, jelzős szerkezet | lassabb tempó, gazdag hang |
| Fejezet-cím | `<h1>`/`<h2>`/`<h3>` | hosszú szünet előtte-utána |

### Szegmens Osztályozás (szabály-alapú alap)

```python
import re

def classify_segment(text: str, has_italic: bool = False) -> str:
    # Dialógus: magyar „" és "" idézőjelek, vagy angol ""
    if re.search(r'[„""][^„""]{5,}["""]', text):
        return "dialogue"
    # Belső monológ: dőlt betű az EPUB-ban
    if has_italic:
        return "inner_monologue"
    # Akció-beat: rövid mondat + cselekvési ige
    if len(text.split()) < 12 and re.search(
        r'\b(futott|felkapta|megfordult|becsapta|felállt|rárontott|elesett)\b',
        text, re.I
    ):
        return "action"
    return "narration"
```

### EPUB Struktúra Megőrzése (`epub_parser.py` fejlesztése)

A jelenlegi `soup.get_text()` mindent eldobál. Helyette DOM-walker kell:

```python
def parse_segment(element) -> dict:
    """Egyedi DOM elem → strukturált szegmens."""
    tag = element.name
    text = element.get_text(strip=True)
    is_italic = tag in ("em", "i") or element.find(["em", "i"])
    is_dialogue = bool(re.search(r'[„""][^„""]+["""]', text))
    return {
        "text": text,
        "type": classify_segment(text, is_italic),
        "is_heading": tag in ("h1", "h2", "h3"),
        "word_count": len(text.split()),
    }
```

### Szöveg Normalizálás TTS Előtt

```python
import re
from num2words import num2words

def preprocess_for_tts(text: str, language: str = "hu") -> str:
    # Kötőjeles szünet → természetes szünet vesszővel
    text = text.replace('—', ', ')
    text = text.replace(' – ', ', ')
    # Rövidítések feloldása
    text = re.sub(r'\bDr\.', 'Doktor', text)
    text = re.sub(r'\bProf\.', 'Professzor', text)
    # Ellipszis normalizálás
    text = text.replace('...', '… ')
    # Zárójeles tartalom eltávolítása (lábjegyzet-hivatkozások)
    text = re.sub(r'\[\d+\]', '', text)
    # Számok szóra (opcionális, magyar TTS-nél hasznos)
    # text = re.sub(r'\b\d+\b', lambda m: num2words(int(m.group()), lang='hu'), text)
    return text.strip()
```

---

## 4. LLM-Vezérelt Annotátor Réteg

### Architektúra

```
EPUB
  │
  ▼
[epub_parser.py — bővített DOM walker]
  Szegmensek típus-jelöléssel + kontextus
  │
  ▼
[llm_annotator.py — ÚJ SZOLGÁLTATÁS]
  Input: szegmens + ±2 bekezdés kontextus
  Output: érzelmi annotáció JSON
  │
  ▼
[tts_engine.py — bővített]
  Szegmensenként megfelelő referencia klip
  Orpheus tagek injektálása ahol kell
  Tempó módosítás (atempo post-processing)
  │
  ▼
[post_processor.py — ÚJ SZOLGÁLTATÁS]
  Csend nyírás, EBU R128 normalizálás
  Kalibrált szünetek összefűzéskor
  │
  ▼
[m4b_assembler.py — ÚJ SZOLGÁLTATÁS]
  Fejezet metaadatok, borítókép
  .m4b kimenet fejezet-navigációval
```

### LLM Annotátor Prompt

```python
ANNOTATE_SEGMENT_PROMPT = """
Hangoskönyv-rendező vagy. Elemezd az alábbi szövegszegmenst és a kontextust,
majd adj vissza JSON annotációt TTS szintézishez.

Előző kontextus:
{context_before}

AKTUÁLIS SZEGMENS:
{segment}

Következő kontextus:
{context_after}

Csak JSON-t adj vissza:
{{
  "segment_type": "narration|dialogue|inner_monologue|action|descriptive|heading",
  "speaker": "narrator vagy karakternév",
  "emotion": "neutral|melancholy|tense|joyful|fearful|angry|romantic|comedic|somber|intimate",
  "intensity": 1-10,
  "pacing": "slow|medium|fast",
  "pause_before_ms": 0-2000,
  "emphasis_words": ["szó1", "szó2"],
  "orpheus_tags": [],
  "direction_note": "egy mondatos rendezői utasítás"
}}
"""
```

### Fejezet-Szintű Érzelmi Ív Elemzés

Egy LLM-hívás fejezet elején — olcsó, de nagy hatás:

```python
EMOTIONAL_ARC_PROMPT = """
Elemezd az alábbi regényfejezetet. Adj vissza JSON objektumot:
- dominant_emotion: [neutral, melancholy, tense, joyful, fearful, angry, romantic, comedic, somber]
- pacing: [slow, medium, fast]
- scene_type: [action, dialogue_heavy, introspective, descriptive, climactic]
- emotional_intensity: 1-10
- narrator_note: egy mondat a narrátornak útmutatásként

Fejezet szövege:
{chapter_text_first_3000_chars}
"""
```

### Karakter Regiszter

```python
CHARACTER_DETECTION_PROMPT = """
Azonosítsd az alábbi regényrészlet összes szereplőjét és a narrátort.
Visszaadandó JSON: {{"characters": [{{"name": str, "gender": str, "age_range": str, "personality_notes": str}}]}}

Szöveg:
{chapter_text_first_5000_chars}
"""
```

Egyszer fut könyvenként, az eredmény cache-elve a teljes pipeline-hoz.

### LLM Hívás Optimalizálás (költség csökkentés)

1. **Szabályalapú első pass** — ~80% szegmens olcsón osztályozva regex-szel
2. **LLM csak ambiguous esetekre** — ahol szabály-konfidencia alacsony
3. **Fejezet-szintű ív elemzés** — egy hívás fejezetenként, propagálva szegmensekre
4. **Batch hívások** — 20-50 szegmens egy API hívásban JSON tömbként

---

## 5. Audio Utófeldolgozás

### Ajánlott Feldolgozási Lánc

```
1. Csend nyírás (szegmensenként)
2. Kalibrált szünetek beillesztése (összefűzéskor)
3. EBU R128 hangerő normalizálás (végső fájlon)
4. High-pass filter 80 Hz-en (zúgás eltávolítás)
5. Jelenlét kiemelés 8 kHz-en (artikuláció tisztasága)
6. Fade in/out fejezet határokon
```

### Szünetek Kalibrálása (pydub)

```python
from pydub import AudioSegment

PAUSES_MS = {
    "dialogue_to_narration": 600,
    "narration_to_dialogue": 300,
    "paragraph": 500,
    "action": 200,
    "heading": 1500,
    "sentence": 150,
}

def build_chapter_audio(chunks: list[AudioSegment], seg_types: list[str]) -> AudioSegment:
    result = AudioSegment.empty()
    for i, (chunk, seg_type) in enumerate(zip(chunks, seg_types)):
        result += chunk
        if i < len(chunks) - 1:
            next_type = seg_types[i + 1]
            if seg_type == "dialogue" and next_type == "narration":
                pause_ms = PAUSES_MS["dialogue_to_narration"]
            elif seg_type == "narration" and next_type == "dialogue":
                pause_ms = PAUSES_MS["narration_to_dialogue"]
            elif seg_type == "heading":
                pause_ms = PAUSES_MS["heading"]
            else:
                pause_ms = PAUSES_MS["paragraph"]
            result += AudioSegment.silent(duration=pause_ms)
    return result
```

### EBU R128 Normalizálás

```bash
pip install ffmpeg-normalize

ffmpeg-normalize chapter_01.wav -o chapter_01_norm.wav \
  --loudness-range-target 7 \
  --target-level -18 \
  --true-peak -1.5 \
  --audio-codec pcm_s16le
```

Hangoskönyv szabvány: `-18 LUFS` (néhány platform `-16 LUFS`), True Peak `-1.5 dBTP`.

### Tempó Módosítás (XTTS-v2 nem tud natívan)

```bash
# 15%-kal gyorsabb (akció jelenetek)
ffmpeg -i input.wav -filter:a "atempo=1.15" output.wav
# 10%-kal lassabb (introspektív részek)
ffmpeg -i input.wav -filter:a "atempo=0.9" output.wav
```

Az `atempo` filter 0.5–2.0x tartományban működik; nagyobb lépéshez láncolni kell.

---

## 6. M4B Kimenet Fejezet-Navigációval

```python
def write_ffmpeg_metadata(chapters: list[dict], output_path: Path):
    """chapters: [{"title": str, "start_ms": int, "end_ms": int}]"""
    lines = [";FFMETADATA1\n"]
    for ch in chapters:
        lines += [
            "[CHAPTER]\n",
            "TIMEBASE=1/1000\n",
            f"START={ch['start_ms']}\n",
            f"END={ch['end_ms']}\n",
            f"title={ch['title']}\n\n",
        ]
    output_path.write_text("".join(lines))
```

```bash
# Összefűzés + konverzió + metaadat + borítókép
ffmpeg -f concat -safe 0 -i chapters.txt -c copy full_book.wav
ffmpeg -i full_book.wav -c:a aac -b:a 64k full_book.m4a
ffmpeg -i full_book.m4a -i metadata.txt -i cover.jpg \
  -map_metadata 1 -map 0 -map 2 \
  -c copy -disposition:v:0 attached_pic \
  audiobook.m4b
```

---

## 7. Implementációs Prioritások (Impact/Effort arány szerint)

### Azonnali (1-2 nap)

1. **Kalibrált szünetek a `_concatenate_audio`-ban** — pydub-bal naturális ritmus, jelenleg nyers concat
2. **EPUB DOM walker** — `epub_parser.py` módosítása strukturált szegmensekre (típus, dialógus jelzés)
3. **Szöveg normalizálás** — em-dash, rövidítések, ellipszis kezelés TTS előtt

### Középtávú (1 hét)

4. **Érzelem-bank referencia klipek** — ugyanazon hang 4-5 különböző regiszterben; egyszerű szabályalapú kiválasztás
5. **Post-processing service** — csend nyírás + EBU R128 normalizálás

### Hosszú táv (2-4 hét)

6. **LLM Annotátor** — Claude API-val fejezet-szintű érzelmi ív elemzés, majd szegmens-szintű annotáció
7. **Karakter regiszter + hang profilok** — egy hang per karakter, könyv elején detektálva
8. **Orpheus-TTS integráció** — dialógus szegmensekhez hibrid pipeline
9. **M4B assembler** — fejezet-navigációval, borítóképpel

---

## 8. Adatmodell Bővítések

### Jelenlegi `Chapter` model bővítése

```python
class Chapter(Base):
    # ... meglévő mezők ...
    segments: Mapped[str | None] = mapped_column(Text, nullable=True)
    # JSON: [{"text": str, "type": str, "emotion": str, "speaker": str, "pause_before_ms": int}]
    emotional_arc: Mapped[str | None] = mapped_column(Text, nullable=True)
    # JSON: {"dominant_emotion": str, "pacing": str, "intensity": int}
    characters: Mapped[str | None] = mapped_column(Text, nullable=True)
    # JSON: [{"name": str, "voice_id": int | null}]
```

### `Voice` model bővítése érzelem-bankkal

```python
class Voice(Base):
    # ... meglévő mezők ...
    emotion_bank: Mapped[str | None] = mapped_column(Text, nullable=True)
    # JSON: {"neutral": "path", "sad": "path", "excited": "path", ...}
```

---

## 9. Referencia Projektek

| Projekt | Mit mutat | Link |
|---------|----------|-------|
| audiobook-creator | Teljes LLM + Kokoro/Orpheus pipeline, érzelem tagek | https://github.com/prakharsr/audiobook-creator |
| tts-audiobook-tool | Multi-model TTS, csend nyírás, hangerő norm | https://github.com/zeropointnine/tts-audiobook-tool |
| Chatterbox-TTS-Extended | XTTS-v2 pipeline, Whisper validáció | https://github.com/SaahBrice/Chatterbox-TTS-Extended |
| m4binder | Python M4B fejezet összefűzés metaadattal | https://github.com/patricker/m4binder |
| ffmpeg-normalize | EBU R128 normalizálás | https://github.com/slhck/ffmpeg-normalize |
| Orpheus-TTS | Inline érzelem tagek, zero-shot klónozás | https://github.com/canopyai/Orpheus-TTS |
| Parler-TTS | Természetes nyelvi stílus leírás, hangoskönyv-edzett | https://github.com/huggingface/parler-tts |
| CosyVoice | LLM-alapú TTS, [laughter]/[breath] tagek | https://github.com/FunAudioLLM/CosyVoice |

---

## Tudományos Háttér

- [XTTS-v2 on Hugging Face](https://huggingface.co/coqui/XTTS-v2)
- [Towards Controllable Speech Synthesis Survey (arXiv 2412.06602)](https://arxiv.org/html/2412.06602v1/)
- [Prosody Analysis of Audiobooks (arXiv 2310.06930)](https://arxiv.org/html/2310.06930v3)
- [FunAudioLLM / CosyVoice Paper (arXiv 2407.04051)](https://arxiv.org/html/2407.04051v2)
- [MultiActor Audiobook Zero-Shot - Interspeech 2025](https://www.isca-archive.org/interspeech_2025/park25e_interspeech.pdf)
- [PRESENT Zero-Shot Prosody Control (arXiv 2408.06827)](https://arxiv.org/html/2408.06827v1)
