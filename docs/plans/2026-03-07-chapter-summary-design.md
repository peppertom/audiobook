# Chapter Summary Feature — Design

**Date:** 2026-03-07
**Status:** Approved

## Overview

Automatikus fejezet-összefoglalók generálása a book detail page-en. Minden fejezethez 3-5 mondatos (~100-150 szó) összefoglaló készül a könyv nyelvén, lokális LLM (Ollama) segítségével.

## Döntések

| Kérdés | Döntés |
|--------|--------|
| Mikor generálódik? | EPUB feltöltéskor automatikusan |
| Nyelv | A könyv nyelvén (magyar→magyar, angol→angol) |
| Hosszúság | 3-5 mondat (~100-150 szó) |
| Ollama fallback | Csendes skip + újrapróbálás gomb a UI-ban |
| Spoiler-védelem | Igen, kattintásra nyitható toggle |
| Megközelítés | Meglévő LLMAnnotator bővítése (Megközelítés A) |

## Adatmodell

Új mező a `Chapter` modellben:

```python
summary: Mapped[str | None] = mapped_column(Text, nullable=True)
```

Migráció:
```sql
ALTER TABLE chapters ADD COLUMN summary TEXT;
```

## Backend

### LLMAnnotator bővítés

Új metódus: `generate_summary(chapter_text: str, language: str = "Hungarian") -> str`

- Input: az első ~3000 karakter a fejezet szövegéből
- Output: 3-5 mondatos összefoglaló a megadott nyelven
- Modell: `qwen2.5:7b-instruct` (meglévő konfig, ~50 tok/s M1-en)
- Prompt: kéri az összefoglalót a könyv nyelvén, spoiler-mentes stílusban
- Error handling: üres string ha Ollama nem elérhető (azonos pattern mint `analyze_chapter_arc`)

### Upload flow módosítás

`POST /api/books/upload` — az EPUB parse és chapter mentés után:

```
EPUB parse → Chapter records mentése DB-be → LLM summary generálás (fejezetenként, szekvenciálisan) → response
```

- Szekvenciális feldolgozás (Ollama GPU egyszerre 1 kérést dolgoz fel hatékonyan)
- Ha Ollama nem elérhető: upload sikerül, `summary` mező `None` marad, warning log
- Becsült időnövekedés: ~3-4s/fejezet, 10 fejezetes könyvnél ~30-40s extra

### Retry endpoint

```
POST /api/books/{book_id}/generate-summaries
```

- Lefuttatja a summary generálást minden `summary IS NULL` fejezetre
- Response: `{ "generated": int, "failed": int, "total": int }`

## Frontend — Book Detail Page

### Fejezet lista elem bővítés

A fejezet címe alatt:

1. **Ha van summary:** spoiler-toggle gomb ("Összefoglaló" felirat)
   - Alapértelmezetten csukva
   - Kattintásra lenyílik/becsukódik a szöveg
   - Animált transition (a meglévő collapsible text panel mintájára)

2. **Ha nincs summary:** "Összefoglaló generálása" gomb
   - Hívja a `POST /api/books/{book_id}/generate-summaries` endpointot
   - Loading state megjelenítése
   - Siker után a summary megjelenik toggle-ben

## LLM konfiguráció

A meglévő Ollama setup használata, nincs szükség új modellre:

| Beállítás | Érték |
|-----------|-------|
| Modell | `qwen2.5:7b-instruct` (settings.ollama_model) |
| URL | `http://localhost:11434` (settings.ollama_url) |
| API | `POST /api/generate` with `format: "json"` |
| Sebesség | ~50 tok/s M1 GPU-n |
| Summary idő | ~3-4s/fejezet |

## Érintett fájlok

| Fájl | Változás |
|------|----------|
| `backend/app/models.py` | `Chapter.summary` mező hozzáadása |
| `backend/app/services/llm_annotator.py` | `generate_summary()` metódus |
| `backend/app/routers/books.py` | Upload flow bővítés + retry endpoint |
| `frontend/src/app/books/[id]/page.tsx` | Summary toggle UI + retry gomb |
| `frontend/src/lib/api.ts` | `generateSummaries()` API hívás |
