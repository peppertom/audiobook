# Reading Experience – Részletes Task Lista
**Terv alapján:** `2026-03-08-reading-experience-improvement-plan.md`
**Dátum:** 2026-03-08

---

## Phase 1 – Alap Tipográfia és Reading Mode

### Task 1.1 – Backend: UserSettings tipográfia mezők

**Fájlok:** `backend/app/models.py`, `backend/app/schemas.py`

**Lépések:**
1. `models.py` – `UserSettings` táblához új mezők:
   ```python
   reading_font_family: Mapped[str] = mapped_column(String(50), default="Literata")
   reading_font_size: Mapped[int] = mapped_column(Integer, default=18)
   reading_line_height: Mapped[float] = mapped_column(Float, default=1.7)
   reading_word_spacing: Mapped[int] = mapped_column(Integer, default=0)
   reading_letter_spacing: Mapped[int] = mapped_column(Integer, default=0)
   reading_max_width: Mapped[int] = mapped_column(Integer, default=680)
   reading_theme: Mapped[str] = mapped_column(String(20), default="dark")
   reading_custom_bg: Mapped[str] = mapped_column(String(7), default="#1A1A2E")
   reading_custom_text: Mapped[str] = mapped_column(String(7), default="#E8E8E8")
   ```
2. `schemas.py` – `UserSettings` Pydantic sémában ugyanezek opcionális mezőkkel
3. DB migration: `docker exec audiobook-postgres-1 psql -U audiobook -d audiobook -c "ALTER TABLE user_settings ADD COLUMN reading_font_family VARCHAR(50) DEFAULT 'Literata', ADD COLUMN reading_font_size INTEGER DEFAULT 18, ADD COLUMN reading_line_height FLOAT DEFAULT 1.7, ADD COLUMN reading_word_spacing INTEGER DEFAULT 0, ADD COLUMN reading_letter_spacing INTEGER DEFAULT 0, ADD COLUMN reading_max_width INTEGER DEFAULT 680, ADD COLUMN reading_theme VARCHAR(20) DEFAULT 'dark', ADD COLUMN reading_custom_bg VARCHAR(7) DEFAULT '#1A1A2E', ADD COLUMN reading_custom_text VARCHAR(7) DEFAULT '#E8E8E8';"`

**Ellenőrzés:** `GET /api/users/me/settings` visszaad reading_ mezőket

---

### Task 1.2 – Frontend: ReadingSettingsContext

**Fájl:** `frontend/src/contexts/ReadingSettingsContext.tsx` (új)

**Lépések:**
1. Context létrehozása a következő állapottal:
   - `fontFamily`, `fontSize`, `lineHeight`, `wordSpacing`, `letterSpacing`, `maxWidth`, `theme`, `customBg`, `customText`
   - `updateSetting(key, value)` – frissíti localt és debounce-olva menti a backendre
2. Kezdeti betöltés: `getUserSettings()` hívás, localStorage fallback ha nincs token
3. CSS custom property-ket alkalmaz a `document.documentElement`-re:
   ```ts
   document.documentElement.style.setProperty('--reading-font', fontFamily)
   document.documentElement.style.setProperty('--reading-size', `${fontSize}px`)
   document.documentElement.style.setProperty('--reading-line-height', String(lineHeight))
   document.documentElement.style.setProperty('--reading-word-spacing', `${wordSpacing / 10}em`)
   document.documentElement.style.setProperty('--reading-letter-spacing', `${letterSpacing / 10}em`)
   document.documentElement.style.setProperty('--reading-max-width', `${maxWidth}px`)
   ```
4. `useReadingSettings()` hook exportálása

**Ellenőrzés:** Context-et berakni layout.tsx-be, chrome devtools-ban látható hogy a CSS var-ok változnak

---

### Task 1.3 – Frontend: Font betöltés (layout.tsx)

**Fájl:** `frontend/src/app/layout.tsx`

**Lépések:**
1. Import-ok:
   ```ts
   import { Literata, Lora, Merriweather, Source_Serif_4, EB_Garamond,
            Libre_Baskerville, Inter, Nunito, Atkinson_Hyperlegible_Next } from 'next/font/google'
   ```
2. Minden fontot inicializálni `variable` opcióval:
   ```ts
   const literata = Literata({ subsets: ['latin'], variable: '--font-literata', display: 'swap' })
   ```
3. A `<body>` className-be felsorolni az összes font variable osztályt
4. ReadingSettingsContext provider hozzáadása az összes gyermek köré

**Ellenőrzés:** `next build` figyelmeztetések nélkül fut; fonts betöltődnek network tab-ban

---

### Task 1.4 – Frontend: ReadingModeOverlay komponens

**Fájl:** `frontend/src/components/ReadingMode/ReadingModeOverlay.tsx` (új)

**Lépések:**
1. Props: `book`, `chapter` (aktuális), `chapters[]`, `onClose`, `onChapterSelect`
2. Layout:
   - Fullscreen fixed overlay (`fixed inset-0 z-50`)
   - Header: fejezet cím + ☰ + ⚙ + ✕ gomb, auto-hide scroll közben (500ms debounce)
   - Szöveg terület: `max-width: var(--reading-max-width)`, `font-family: var(--reading-font)` stb. CSS var-okkal
   - Fixed bottom mini player (Task 1.5)
   - Bal oldali chapter sidebar (összecsukható, Task 1.6)
   - Lebegő Typography Panel gomb (Task 1.7)
3. Header auto-hide logika: `useScrollDirection()` hook, lefelé görgetve eltűnik, felfelé visszajön
4. `Escape` billentyűre `onClose()` hívás
5. `F` billentyűre toggle (a szülő oldal kezeli)
6. Szöveg renderelés: `ch.text_content` egyszerű paragrafusokba törve (`\n\n` split)

**Ellenőrzés:** Reading mode gomb megnyomva az overlay fullscreenbe nyílik, Esc bezárja

---

### Task 1.5 – Frontend: MiniPlayer (fixed bottom)

**Fájl:** `frontend/src/components/ReadingMode/MiniPlayer.tsx` (új)

**Lépések:**
1. Props: `audioSrc`, `currentTime`, `duration`, `playing`, `onPlay`, `onPause`, `onSeek`, `onPrev`, `onNext`, `speed`, `onSpeedChange`
2. Layout: `fixed bottom-0 left-0 right-0`, sötét háttér, blur backdrop
3. Tartalom: [◀] [▶/⏸] progress bar [időzítő] [🔊] [1x/1.5x/2x]
4. A progress bar kattintható (seek)
5. Speed toggle: 1x → 1.25x → 1.5x → 2x → 0.75x → 1x körkörösen
6. **Mobil safe-area padding:** `padding-bottom: env(safe-area-inset-bottom)` – iPhone notch/home indicator miatt; a szöveg konténer alsó paddingja = mini player magassága + safe-area

**Ellenőrzés:** Reading mode-ban lejátszik, sáv seekelhető, sebesség változtatható; iPhone-on a player nem takarja a home indicator-t

---

### Task 1.6 – Frontend: ChapterSidebar komponens

**Fájl:** `frontend/src/components/ReadingMode/ChapterSidebar.tsx` (új)

**Lépések:**
1. Props: `chapters[]`, `currentChapterId`, `onSelect`, `open`, `onClose`
2. Bal oldalról csúszó panel (`translate-x` animáció, Tailwind `transition-transform`)
3. Fejezet lista: sorszám + cím + progress % (ha van ReadingState adat) + ✓ jelölés ha 100%
4. Aktuális fejezet kiemelve (► ikon, más háttér)
5. Alul összesített progress % és becsült hátralévő idő (ha audio duration ismert)
6. Overlay backdrop a panel mögé, kattintásra bezár

**Ellenőrzés:** ☰ gombra megnyílik, fejezetre kattintva vált, backdrop kattintva bezár

---

### Task 1.7 – Frontend: TypographyPanel komponens

**Fájl:** `frontend/src/components/ReadingMode/TypographyPanel.tsx` (új)

**Lépések:**
1. Lebegő gomb (🔤) a jobb alsó sarokban (fölötte a mini player-nek)
2. Kattintva kinyílik egy panel (`fixed bottom-24 right-4`)
3. Tartalom:
   - Font selector: legördülő a 9 fonttal, minden opció a saját fontjával jelenik meg
   - Betűméret: [A-] [18px] [A+] gombokkal (1px lépés) + **[S] [M] [L] presetek** (14px / 18px / 24px)
   - Sortávolság slider (1.2–2.5, 0.1 lépés)
   - Szóköz: slider (0–10) + **[Normál] [Kényelmes] [Tág] presetek** (0 / 3 / 6 értékkel)
   - Betűköz slider (-2–5, 1 lépés → /10 em-ben jelenik meg)
   - Szövegoszlop szélesség slider (480–900, 20 lépés px-ben)
   - **[Visszaállítás]** gomb az összes olvasási beállítás defaultra (egy kattintás)
4. Minden változás azonnal meghívja `updateSetting(key, value)` a contextből
5. Bezáró X gomb

**Ellenőrzés:** Slider mozgatva azonnal változik a szöveg megjelenése a mögöttes overlay-en

---

### Task 1.8 – Frontend: Reading Mode integráció a book detail oldalba

**Fájl:** `frontend/src/app/books/[id]/page.tsx`

**Lépések:**
1. `readingMode: boolean` state hozzáadása
2. `📖 Olvasási mód` gomb a page tetején (fejezetek lista felett)
3. `F` billentyű event listener a page-en (toggle)
4. `<ReadingModeOverlay>` renderelése ha `readingMode === true`, props bekötése
5. `onClose`: `setReadingMode(false)`
6. `onChapterSelect(id)`: fejezetet vált (meglévő logika)

**Ellenőrzés:** Gombra megnyílik az overlay, F-fel toggle, Esc bezár

---

### Task 1.9 – Frontend: Betűméret billentyűparancsok

**Fájl:** `frontend/src/components/ReadingMode/ReadingModeOverlay.tsx`

**Lépések:**
1. `useEffect` event listener: `keydown`
2. `+` / `=` → `updateSetting('fontSize', Math.min(32, fontSize + 1))`
3. `-` → `updateSetting('fontSize', Math.max(12, fontSize - 1))`
4. `Ctrl+Plus` / `Cmd+Plus` → fontSize +2 (gyors növelés)
5. `Ctrl+Minus` / `Cmd+Minus` → fontSize -2 (gyors csökkentés)
6. `Ctrl+0` / `Cmd+0` → reset összes beállítás defaultra
7. `T` → téma körkörösen váltás

**Ellenőrzés:** Reading mode-ban +/- gomb változtatja a méretet, Ctrl+/- is működik, T vált témát

---

## Phase 2 – Pozíció Mentés és Haladás

### Task 2.1 – Backend: ReadingState modell

**Fájlok:** `backend/app/models.py`, `backend/app/schemas.py`

**Lépések:**
1. `models.py` – új `ReadingState` tábla:
   ```python
   class ReadingState(Base):
       __tablename__ = "reading_states"
       id: Mapped[int] = mapped_column(primary_key=True)
       user_id: Mapped[str] = mapped_column(String, ForeignKey("users.id"))
       book_id: Mapped[int] = mapped_column(Integer, ForeignKey("books.id"))
       current_chapter_id: Mapped[int] = mapped_column(Integer, ForeignKey("chapters.id"))
       scroll_position: Mapped[float] = mapped_column(Float, default=0.0)
       paragraph_index: Mapped[int] = mapped_column(Integer, default=0)  # bekezdés sorszáma a fejezetben
       reading_progress: Mapped[float] = mapped_column(Float, default=0.0)
       audio_position: Mapped[float] = mapped_column(Float, default=0.0)
       voice_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
       updated_at: Mapped[datetime] = mapped_column(DateTime, default=func.now(), onupdate=func.now())
       __table_args__ = (UniqueConstraint("user_id", "book_id"),)
   ```
2. `schemas.py` – `ReadingStateOut`, `ReadingStateUpdate` sémák
3. DB migration:
   ```sql
   CREATE TABLE reading_states (
     id SERIAL PRIMARY KEY,
     user_id VARCHAR NOT NULL REFERENCES users(id),
     book_id INTEGER NOT NULL REFERENCES books(id),
     current_chapter_id INTEGER NOT NULL REFERENCES chapters(id),
     scroll_position FLOAT DEFAULT 0.0,
     paragraph_index INTEGER DEFAULT 0,
     reading_progress FLOAT DEFAULT 0.0,
     audio_position FLOAT DEFAULT 0.0,
     voice_id INTEGER,
     updated_at TIMESTAMP DEFAULT NOW(),
     UNIQUE(user_id, book_id)
   );
   ```

**Ellenőrzés:** Tábla létezik, unique constraint működik

---

### Task 2.2 – Backend: reading router

**Fájl:** `backend/app/routers/reading.py` (új), `backend/app/main.py`

**Lépések:**
1. `reading.py`:
   - `GET /api/reading/{book_id}` → `ReadingStateOut` (404 ha nem létezik)
   - `PUT /api/reading/{book_id}` → upsert `ReadingStateUpdate` (INSERT ... ON CONFLICT UPDATE)
2. `main.py` – router regisztrálása: `app.include_router(reading_router, prefix="/api/reading")`

**Ellenőrzés:** `PUT /api/reading/1` menti az állapotot, `GET /api/reading/1` visszaadja

---

### Task 2.3 – Frontend: api.ts bővítése

**Fájl:** `frontend/src/lib/api.ts`

**Lépések:**
1. `ReadingState` interface hozzáadása
2. `getReadingState(bookId)` → `GET /api/reading/{bookId}`
3. `saveReadingState(bookId, data)` → `PUT /api/reading/{bookId}`

**Ellenőrzés:** TypeScript hibák nincsenek, build sikeres

---

### Task 2.4 – Frontend: Auto-save logika

**Fájl:** `frontend/src/components/ReadingMode/ReadingModeOverlay.tsx`

**Lépések:**
1. `useRef` a scroll container-hez; bekezdések `data-para-index` attribútummal ellátva rendereléskor
2. Scroll event listener → `IntersectionObserver` figyeli melyik bekezdés van a viewport közepén → `paragraphIndex` frissítése
3. `scrollPosition = scrollTop / scrollHeight` fallback (gyors scroll esetén)
4. `readingProgress` kiszámítása: `(chapterIndex + scrollPosition) / totalChapters`
5. `useDebouncedCallback` (5000ms) → `saveReadingState()` hívás
6. `beforeunload` event listener → azonnali `saveReadingState()` mentés (debounce nélkül)
7. Fejezet váltáskor mentés (azonnali)
8. Visszatöltéskor: `paragraph_index`-szel görget az adott bekezdéshez (`element.scrollIntoView`)
9. Mentés után 2 másodpercig megjelenik a `✓ Elmentve` toast (jobb alul, diszkrét)

**Ellenőrzés:** Scroll után 5mp-cel DB-ben frissül; újranyitáskor pontosan a mentett bekezdésnél nyílik meg

---

### Task 2.5 – Frontend: Folytatás prompt (ResumePrompt)

**Fájl:** `frontend/src/components/ResumePrompt.tsx` (új)

**Lépések:**
1. Props: `state: ReadingState`, `book: BookDetail`, `onResume()`, `onStartOver()`
2. Modal overlay megjelenítése ha `state.reading_progress > 0`
3. Tartalom: `📍 Folytassa ott, ahol abbahagyta?`, fejezet neve + haladás %, dátum
4. [Folytatás] gomb → `onResume()`, [Az elejéről] gomb → `onStartOver()`
5. Beépítés: `books/[id]/page.tsx` – lap betöltésekor `getReadingState()` hívás, ha van state → prompt megjelenítése

**Ellenőrzés:** Könyv újranyitásakor megjelenik a prompt ha van mentett állapot

---

### Task 2.6 – Frontend: Fejezet progress % megjelenítése

**Fájl:** `frontend/src/app/books/[id]/page.tsx`, `frontend/src/components/ReadingMode/ChapterSidebar.tsx`

**Lépések:**
1. `getReadingState()` adatából kiszámítani, hogy melyik fejezetnél tartunk
2. Book detail oldalon minden fejezet mellé kis progress indicator (pl. `34%` szürkén)
3. ChapterSidebar-ban szintén progress % minden sornál
4. Befejezett fejezetek mellé ✓ jelölés
5. **Fejezet olvasási idő becslés:** `Math.ceil(chapter.word_count / 200)` perc (200 szó/perc átlag) → megjelenítés: `~7 perc` szürkén a fejezet cím után, mind a book detail oldalon, mind a ChapterSidebar-ban

**Ellenőrzés:** Fejezet listában látható a haladás % és az olvasási idő becslés

---

## Phase 3 – Témák és Vizuális Finomítás

### Task 3.1 – Beépített témák definíciója

**Fájl:** `frontend/src/contexts/ReadingSettingsContext.tsx`

**Lépések:**
1. `THEMES` konstans objektum a 7 témával:
   ```ts
   export const THEMES = {
     white:     { bg: '#FFFFFF', text: '#1A1A1A', accent: '#2563EB', name: 'Fehér' },
     sepia:     { bg: '#F5F0E8', text: '#3B2F1E', accent: '#8B5E3C', name: 'Szépia' },
     gray:      { bg: '#F0F0F0', text: '#2A2A2A', accent: '#4A4A8A', name: 'Szürke' },
     dark:      { bg: '#1A1A2E', text: '#E8E8E8', accent: '#6C8EF5', name: 'Sötét' },
     black:     { bg: '#000000', text: '#CCCCCC', accent: '#888888', name: 'Fekete' },
     forest:    { bg: '#1C2B1A', text: '#D4E8D0', accent: '#7BC67B', name: 'Erdő' },
     sunrise:   { bg: '#FFF8F0', text: '#2D1B00', accent: '#E07A5F', name: 'Napfelkelte' },
   }
   ```
2. `applyTheme(themeName)` függvény: CSS var-okba írja a `--reading-bg`, `--reading-text`, `--reading-accent` értékeket
3. Custom téma esetén: `reading_custom_bg` és `reading_custom_text` mezők alkalmazása

**Ellenőrzés:** Téma váltáskor az overlay háttere és szövegszíne azonnal változik

---

### Task 3.2 – ThemeSelector komponens

**Fájl:** `frontend/src/components/ThemeSelector.tsx` (új)

**Lépések:**
1. 7 beépített téma kártyái (kis téglalap, megmutatja a háttér + szöveg színt + nevet)
2. Kiválasztott téma kiemelve (keret/check ikon)
3. Egyéni téma szekció: két `<input type="color">` (háttér + szöveg)
4. Kontrasztarány valós idejű kijelzése (WCAG AA: min 4.5:1); piros figyelmeztetés ha nem éri el
5. Kontrasztarány számítás: relative luminance képlettel (W3C specifikáció alapján)
6. Felhasználás: TypographyPanel-ben a téma szekció + `/settings/reading` oldalon

**Ellenőrzés:** Egyéni színek esetén a kontrasztarány helyesen számolódik

---

### Task 3.3 – Téma váltás animáció

**Fájl:** `frontend/src/app/layout.tsx` vagy globális CSS

**Lépések:**
1. `globals.css`-ben:
   ```css
   :root {
     transition: background-color 0.3s ease, color 0.3s ease;
   }
   ```
2. ReadingModeOverlay-en is `transition-colors duration-300`

**Ellenőrzés:** Téma váltáskor smooth fade, nem villan

---

### Task 3.4 – Beállítások oldal (`/settings/reading`)

**Fájl:** `frontend/src/app/settings/reading/page.tsx` (új)

**Lépések:**
1. Oldal layout: kéthasábos (bal: beállítások, jobb: élő előnézet)
2. Bal oldal szekciók:
   - 🔤 Tipográfia: FontSelector, betűméret/sortávolság/szóköz/betűköz/szélesség sliderek
   - 🎨 Megjelenés: ThemeSelector egyéni opciókkal
   - 📖 Olvasási élmény: auto-scroll on/off, szinkronizált kiemelés on/off, szünet emlékeztető (perc)
   - 🔊 Lejátszás: alap sebesség, auto-play következő fejezet
3. Jobb oldal: Dummy szöveg (lorem ipsum magyarul), a CSS var-ok alapján stílusozva
4. "Visszaállítás" gomb az összes beállítás defaultra
5. Navigációba link hozzáadása

**Ellenőrzés:** A jobb oldali preview valós időben frissül a beállítások változásakor

---

### Task 3.5 – FontSelector komponens

**Fájl:** `frontend/src/components/FontSelector.tsx` (új)

**Lépések:**
1. 9 font kártyákban (kis méretű, mutatja a font nevét a saját fontjával + "Aa" preview szöveg)
2. Kiválasztott kiemelve (kék keret + ✓)
3. **"Ajánlott" badge** a Literata és az Atkinson Hyperlegible kártyákon (kis zöld "★ Ajánlott" pill)
4. Hover-re tooltip: rövid leírás (pl. "Digitális olvasásra tervezve · Google Books-ban is használt")
5. Felhasználás: TypographyPanel-ben legördülő helyett kártyák (scrollozható sor)

**Ellenőrzés:** Kártya kattintva az overlay szövege azonnal a kiválasztott fonttal jelenik meg; "Ajánlott" badge látható

---

### Task 3.6 – Focus Line mód

**Fájlok:** `frontend/src/components/ReadingMode/ReadingModeOverlay.tsx`, `frontend/src/contexts/ReadingSettingsContext.tsx`

**Lépések:**
1. `focusLineMode: boolean` beállítás a contextbe (default: false); backend `UserSettings`-ben `reading_focus_line: bool DEFAULT false`
2. ReadingModeOverlay szöveg rendereléskor minden bekezdés `<p>` kap egy `data-para-index` attribútumot
3. Az `IntersectionObserver` (Task 2.4-ből) már jelzi az aktuális `paragraphIndex`-et
4. Ha `focusLineMode === true`:
   - Az aktuális bekezdés: normál szín + `font-weight: 500` + enyhe háttérkiemelés (`bg-opacity-10`)
   - Többi bekezdés: `opacity-40` + `transition-opacity duration-300`
5. TypographyPanel-be toggle kapcsoló hozzáadása: `[◎ Fókusz mód]`
6. Billentyűparancs: `L` → toggle focus line mód

**Ellenőrzés:** Focus mód bekapcsolva az aktuális bekezdés kiemelve, a többi halványabb; görgetésre követ

---

## Phase 4 – Prémium Feature-ök

### Task 4.1 – Könyvjelző rendszer (backend)

**Fájlok:** `backend/app/models.py`, `backend/app/schemas.py`, `backend/app/routers/reading.py`

**Lépések:**
1. `Bookmark` modell:
   ```python
   class Bookmark(Base):
       __tablename__ = "bookmarks"
       id: Mapped[int]
       user_id: Mapped[str]
       book_id: Mapped[int]
       chapter_id: Mapped[int]
       scroll_position: Mapped[float]
       audio_position: Mapped[float]
       label: Mapped[str | None]
       created_at: Mapped[datetime]
   ```
2. DB migration
3. API végpontok a reading router-be:
   - `GET /api/reading/{book_id}/bookmarks`
   - `POST /api/reading/{book_id}/bookmarks` (body: chapter_id, position, label)
   - `DELETE /api/reading/{book_id}/bookmarks/{id}`

**Ellenőrzés:** Könyvjelző létrehozható és listázható

---

### Task 4.2 – Könyvjelző rendszer (frontend)

**Fájlok:** `frontend/src/lib/api.ts`, `frontend/src/components/ReadingMode/ReadingModeOverlay.tsx`, `frontend/src/components/ReadingMode/ChapterSidebar.tsx`

**Lépések:**
1. `api.ts` – `getBookmarks`, `createBookmark`, `deleteBookmark` függvények
2. `B` billentyűre könyvjelző rögzítés az aktuális pozícióhoz
3. Képernyő sarokban rövid `🔖 Elmentve` toast
4. ChapterSidebar-ban könyvjelzők szekció fejezetek után
5. Könyvjelzőre kattintva az overlay a megfelelő pozícióra ugrik + az audio is

**Ellenőrzés:** B gomb menti, sidebar listázza, kattintva pozícióba ugrik

---

### Task 4.3 – Teljes billentyűzet shortcut rendszer

**Fájl:** `frontend/src/components/ReadingMode/ReadingModeOverlay.tsx` (hook kiszervezve)

**Lépések:**
1. `useReadingKeyboard(handlers)` custom hook létrehozása
2. Implementálandó shortcutok:
   - `Space` → play/pause
   - `←` → -10s skip
   - `→` → +10s skip
   - `Ctrl+←` → előző fejezet
   - `Ctrl+→` → következő fejezet
   - `↑` / `↓` → scroll 100px
   - `F` → reading mode toggle
   - `T` → téma váltás
   - `+` / `=` → fontSize +1
   - `-` → fontSize -1
   - `Ctrl+0` → beállítások reset
   - `B` → könyvjelző
   - `Esc` → overlay bezárása
3. Conflict prevention: input mezőkben ne tüzeljen
4. Shortcut overlay (`?` billentyűre megjelenő help panel)

**Ellenőrzés:** Összes shortcut működik, inputban nem interferál

---

### Task 4.4 – Olvasási statisztikák (backend)

**Fájlok:** `backend/app/models.py`, `backend/app/routers/reading.py`

**Lépések:**
1. `ReadingSession` modell:
   ```python
   class ReadingSession(Base):
       __tablename__ = "reading_sessions"
       id: Mapped[int]
       user_id: Mapped[str]
       book_id: Mapped[int]
       started_at: Mapped[datetime]
       ended_at: Mapped[datetime | None]
       words_read: Mapped[int]
       chapters_completed: Mapped[int]
   ```
2. Session tracking: reading mode megnyitáskor session indul, bezáráskor végzódik
3. `GET /api/reading/stats` → mai olvasás, heti átlag, olvasási sebesség becslés
4. DB migration

**Ellenőrzés:** Session rögzítve, stats endpoint adatot ad vissza

---

### Task 4.5 – Olvasási statisztikák (frontend)

**Fájl:** `frontend/src/app/settings/reading/page.tsx` (stats szekció)

**Lépések:**
1. Stats szekció a beállítások oldalon:
   - Mai olvasás: X perc, Y fejezet
   - Heti átlag: X perc/nap
   - Becsült befejezés
   - Olvasási sebesség (szó/perc)
   - Befejezett könyvek száma
2. Streak megjelenítése (hány napja olvasott egymás után)

**Ellenőrzés:** Stats megjelennek ha van reading session adat

---

### Task 4.6 – Szótár integráció

**Fájl:** `frontend/src/components/ReadingMode/DictionaryPopup.tsx` (új)

**Lépések:**
1. Szöveg kijelölésre `mouseup` event figyelés az overlay szöveg területén
2. Ha ki van jelölve 1 szó: kis popup megjelenik a kijelölés fölött
3. Popup gombok: [Szótár] [Kiemelés]
4. Szótárra kattintva: `https://en.wiktionary.org/api/rest_v1/page/summary/{word}` lekérés
5. Popup tartalom: szó, szófaj, definíció (rövid), kiejtés gomb (ha elérhető)
6. Mentett szavak: localStorage-ban tárolt lista, elérhető a settings oldalon

**Ellenőrzés:** Szó kijelölve popup megjelenik, szótár adatot tölt be

---

### Task 4.7 – Auto-scroll mód

**Fájl:** `frontend/src/components/ReadingMode/ReadingModeOverlay.tsx`

**Lépések:**
1. `autoScrollActive: boolean` és `autoScrollSpeed: number` (1–10 skála, default: 3) state
2. `requestAnimationFrame` alapú görgetés: `scrollTop += speed * 0.5` px / frame (60fps-en ~30px/s az 5-ös értéknél)
3. Szüneteltetés: bármilyen scroll event, kattintás, vagy `Space` gomb → auto-scroll leáll
4. Újraindítás: dedikált gombbal vagy `A` billentyűvel
5. Sebesség vezérlő: `[◀] [▶]` gombokkal a MiniPlayer-ben (auto-scroll aktív állapotban jelenik meg) vagy a TypographyPanel-ben csúszkaként
6. Vizuális jelzés aktív állapotban: ▶▶ ikon animálva a header-ben
7. Auto-scroll ér fejezet végére → leáll, toast: "Fejezet vége — folytassa a következőnél?"

**Megjegyzés:** Első iteráció, pontosság javítható ha szükséges (görgetési sebesség nem garantáltan precíz minden eszközön)

**Ellenőrzés:** Auto-scroll indul, sebesség állítható, kattintásra megáll, fejezet végén értesít

---

## Phase 5 – Accessibility

### Task 5.1 – ARIA rendszer

**Fájlok:** Összes ReadingMode komponens

**Lépések:**
1. `ReadingModeOverlay` – `role="dialog"`, `aria-modal="true"`, `aria-label="Olvasási mód"`
2. MiniPlayer – `role="region"`, `aria-label="Audio lejátszó"`, gombok `aria-label`-jei
3. ChapterSidebar – `role="navigation"`, `aria-label="Fejezet navigáció"`
4. Progress bar – `role="progressbar"`, `aria-valuenow`, `aria-valuemin`, `aria-valuemax`
5. Sliderek – `role="slider"`, `aria-valuetext`

**Ellenőrzés:** VoiceOver/NVDA-val navigálható, minden interaktív elem leírással rendelkezik

---

### Task 5.2 – WCAG AA kontrasztarány ellenőrzés

**Lépések:**
1. Minden témánál kontrasztarány kiszámítása (előre, nem runtime):
   - Fehér: 16.1:1 ✓
   - Szépia: 8.7:1 ✓
   - Sötét: 11.2:1 ✓
   - stb.
2. Unit teszt a kontrasztarány függvényre
3. Custom téma picker-ben figyelmeztetés ha < 4.5:1

**Ellenőrzés:** `npm test` – kontrasztarány tesztek zöldek

---

### Task 5.3 – Mobile gesztus navigáció

**Fájl:** `frontend/src/components/ReadingMode/ReadingModeOverlay.tsx`

**Lépések:**
1. `useTouchGestures()` hook:
   - Swipe left → következő fejezet
   - Swipe right → előző fejezet
   - Pinch zoom → fontSize módosítás
2. Touch events: `touchstart`, `touchend` delta számítással
3. Min. 80px swipe threshold, max. 300ms gesture time
4. Pinch: két ujj distance változása → fontSize map

**Ellenőrzés:** Mobilon swipe-olva fejezetet vált, pinch változtatja a méretet

---

### Task 5.4 – Redukált mozgás support

**Fájlok:** Globális CSS, ReadingModeOverlay, ChapterSidebar

**Lépések:**
1. `globals.css`:
   ```css
   @media (prefers-reduced-motion: reduce) {
     *, *::before, *::after {
       animation-duration: 0.01ms !important;
       transition-duration: 0.01ms !important;
     }
   }
   ```
2. ChapterSidebar csúszás animáció → instant megjelenítés reduced motion esetén
3. Auto-scroll → instant ugrás smooth scroll helyett

**Ellenőrzés:** macOS Accessibility → Reduce Motion bekapcsolva, animációk nem játszódnak le

---

## Implementációs Sorrend (ajánlott)

```
Phase 1: 1.1 → 1.2 → 1.3 → 1.4 → 1.5 → 1.6 → 1.7 → 1.8 → 1.9
Phase 2: 2.1 → 2.2 → 2.3 → 2.4 → 2.5 → 2.6
Phase 3: 3.1 → 3.2 → 3.3 → 3.4 → 3.5 → 3.6
Phase 4: 4.1 → 4.2 → 4.3 → 4.4 → 4.5 → 4.6 → 4.7
Phase 5: 5.1 → 5.2 → 5.3 → 5.4
```

Phase 1 task-jai részben párhuzamosíthatók:
- 1.1 (backend) párhuzamosan 1.2 + 1.3 (frontend boilerplate)
- 1.4 + 1.5 + 1.6 + 1.7 (komponensek) párhuzamosan fejleszthetők
- 1.8 + 1.9 csak 1.4 után

**Összesen: 30 task** (Phase 1: 9, Phase 2: 6, Phase 3: 6, Phase 4: 7, Phase 5: 4)

---

*Generálva: 2026-03-08*
