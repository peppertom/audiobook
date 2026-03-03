# 2026-03-03 Audiobook App — Hiányzó funkciók és javítások

## Összefoglaló

A PR #1 merge után a backend API teljes (19 teszt zöld), a frontend alapváz kész.
A fő probléma: **a Voices oldal nem támogatja a hangminta feltöltést**, így a teljes
könyv→hang workflow nem használható a UI-ból.

## Jelenlegi állapot

### ✅ Működik
- **Library oldal**: EPUB drag-drop feltöltés, könyv grid
- **Book detail oldal**: Fejezetek listája, voice kiválasztás, "Generate Audiobook" gomb
- **Queue oldal**: Job-ok listája 3s polling-gel
- **Player komponens**: Play/pause, seek, időkijelzés
- **Backend API**: Minden endpoint kész (books, voices, jobs, playback)

### ❌ Hiányzik
| # | Hol | Mi hiányzik | Hatás |
|---|-----|-------------|-------|
| 1 | `api.ts` | `uploadReferenceClip()` és `createVoiceFromYoutube()` függvények | Frontend nem tud hangmintát küldeni |
| 2 | Voices oldal | WAV fájl feltöltő gomb | Nincs mód reference clip hozzáadására |
| 3 | Voices oldal | YouTube URL mező + gomb | Nincs mód YouTube-ról hangot kinyerni |
| 4 | VoiceSelector | Nem szűr reference clip nélküli voice-okra | Kiválaszthatunk voice-ot ami TTS-ben hibázna |
| 5 | Queue oldal | Csak `Job #id` és `Chapter {id}` — nem mutat könyv/fejezet nevet | Rossz UX |

## Javítási terv

### Task 1: API client kiegészítés (`api.ts`)

**Fájl**: `frontend/src/lib/api.ts`

Hozzáadni:
```typescript
export const uploadReferenceClip = async (voiceId: number, file: File) => {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch(`${API_BASE}/api/voices/${voiceId}/reference-clip`, {
    method: "POST", body: form,
  });
  if (!res.ok) throw new Error("Upload failed");
  return res.json() as Promise<Voice>;
};

export const createVoiceFromYoutube = async (voiceId: number, url: string) =>
  fetchApi<Voice>(`/api/voices/${voiceId}/from-youtube?url=${encodeURIComponent(url)}`, {
    method: "POST",
  });
```

### Task 2: Voices oldal újraépítése

**Fájl**: `frontend/src/app/voices/page.tsx`

Új funkciók:
- Voice létrehozás után → megjelenik egy **WAV feltöltő gomb** az adott voice-nál
- **YouTube URL input** + "Extract Voice" gomb
- Státusz jelzés: "No clip" / "Has clip ✓" / "Uploading..." / "Extracting..."
- A voice kártyán lehessen reference clip-et is cserélni

UI struktúra voice kártyánként:
```
┌──────────────────────────────────────────────────────┐
│ Voice Name                                    [Delete]│
│ source: upload · ✓ Has reference clip                │
│                                                      │
│ [Upload WAV]  vagy  [YouTube URL: ______] [Extract]  │
└──────────────────────────────────────────────────────┘
```

### Task 3: VoiceSelector szűrés

**Fájl**: `frontend/src/components/VoiceSelector.tsx`

- Csak azokat a voice-okat mutassa, amelyeknél van `reference_clip_path`
- Ha nincs egyetlen kész voice sem: "No voices with reference clips. Add one in Voices page."

### Task 4: Queue oldal javítás

**Fájl**: `frontend/src/app/queue/page.tsx`
**Backend**: Új endpoint vagy a meglévő bővítése

Opciók:
- **A)** Backend: Jobs endpoint visszaadja a chapter és book nevét is (nested response)
- **B)** Frontend: Külön lekérdezi a book/chapter adatokat

→ **A)** a jobb megoldás: `JobOut` schema bővítés `chapter_title` és `book_title` mezőkkel

### Task 5: Build ellenőrzés

- `npm run build` — frontend build zöld
- `pytest tests/` — backend tesztek zöldek
- Commit és push

## Teljes felhasználói flow (javítás után)

```
1. Library → EPUB feltöltés (drag-drop)
2. Voices → "Create Voice" (név megadása)
3. Voices → WAV feltöltés VAGY YouTube URL megadás
   - WAV: 6-15 mp tiszta beszéd (nem zene, nem háttérzaj)
   - YouTube: URL megadás → demucs kivonja a vokált → referencia clip
4. Book detail → Voice kiválasztás (csak kész voice-ok)
5. Book detail → "Generate Audiobook" → minden fejezetre job-ot hoz létre
6. Queue → Job-ok állapota (queued → processing → done/failed)
7. Book detail → Kész fejezetek lejátszása a Player-rel
```

## Megjegyzések

- A worker (`arq`) és a TTS motor (`XTTS-v2`) **GPU-t és Redis-t** igényel
- A demucs (YouTube vocal isolation) szintén GPU-igényes
- Ezek nem a frontend javítás részei — külön setup szükséges
- A `torch`, `TTS`, `demucs` csomagok nincsenek a `requirements.txt`-ben (szándékos: nehéz GPU deps)
