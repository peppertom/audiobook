# Olvasási Élmény Javítási Terv
**Dátum:** 2026-03-08
**Projekt:** Audiobook Platform – Reading UX Overhaul
**Branch:** `claude/audiobook-production-research-tmcQo`

---

## Összefoglalás

Ez a dokumentum a könyv olvasási élményének teljes körű javítási tervét tartalmazza, beleértve a tipográfiai testreszabhatóságot, a fókuszált olvasási módot, az állapotmentést és számos prémium UX-fejlesztést. A cél: **a legjobb e-book/audiobook olvasási élmény** megteremtése, amely a Kindle, Apple Books és Readwise Reader szintjét eléri vagy meghaladja.

---

## 1. Betűtípus-rendszer (Font System)

### 1.1 Elérhető betűtípusok

Prémium, olvasásra optimalizált Google Fonts betűtípusok, amelyeket felhasználó választhat:

| Betűtípus | Stílus | Miért jó? |
|---|---|---|
| **Literata** | Serif | Google Books főbetűje, kifejezetten digitális olvasásra tervezve |
| **Lora** | Serif | Elegáns, klasszikus könyv-feel |
| **Merriweather** | Serif | Képernyőre optimalizált, kiváló olvashatóság |
| **Source Serif 4** | Serif | Adobe prémium, változó súlyú |
| **EB Garamond** | Serif | Klasszikus irodalmi hangulat |
| **Libre Baskerville** | Serif | Könyv-tipográfia stílus |
| **Inter** | Sans-serif | Modern, clean, jó kontraszttal |
| **Nunito** | Sans-serif | Lekerekített, barátságos |
| **Atkinson Hyperlegible** | Sans-serif | Akadálymentességre tervezve, maximális olvashatóság |

**Default:** `Literata` (legjobb digitális olvasási tapasztalat)

### 1.2 Implementáció

**Backend – UserSettings modell bővítése:**
```python
# backend/app/models.py
class UserSettings(Base):
    # ... meglévő mezők ...
    reading_font_family: str = "Literata"
    reading_font_size: int = 18          # px, 12–32 között
    reading_line_height: float = 1.7     # 1.2–2.5 között
    reading_word_spacing: int = 0        # em × 10, 0–10
    reading_letter_spacing: int = 0      # em × 10, -2–5
    reading_max_width: int = 680         # px, 480–900 (szövegoszlop szélessége)
    reading_theme: str = "white"         # white | sepia | dark | black | custom
    reading_custom_bg: str = "#FFFFFF"
    reading_custom_text: str = "#1A1A1A"
```

**Frontend – Font betöltés (layout.tsx):**
```tsx
// next/font/google használata, subset optimalizálással
import { Literata, Lora, Merriweather, Source_Serif_4, EB_Garamond,
         Libre_Baskerville, Inter, Nunito, Atkinson_Hyperlegible } from 'next/font/google'
```

**Frontend – CSS változók dinamikus alkalmazása:**
```tsx
// ReadingSettings context – globálisan elérhető
const style = {
  '--reading-font': settings.fontFamily,
  '--reading-size': `${settings.fontSize}px`,
  '--reading-line-height': settings.lineHeight,
  '--reading-word-spacing': `${settings.wordSpacing / 10}em`,
  '--reading-letter-spacing': `${settings.letterSpacing / 10}em`,
  '--reading-max-width': `${settings.maxWidth}px`,
} as React.CSSProperties
```

---

## 2. Olvasási Mód (Reading Mode / Focus Mode)

### 2.1 Koncepció

Amikor a felhasználó **Reading Mode**-ba kapcsol:
- Az audio lejátszó **fixen marad alul** (mini player, mindig látható)
- Az aktuális fejezet szövege **teljes képernyőre nyílik** – minden navigáció, sidebar eltűnik
- A fejezet-választó egy diszkrét **oldalpanel** mögé húzódik
- Fókusz: csak a szöveg és az audio kontroll

### 2.2 UI Layout – Reading Mode

```
┌─────────────────────────────────────────────────────────┐
│  [☰] Chapter 3: The Call of the Wild          [⚙️] [✕]  │  ← Header (auto-hide scrollnál)
├─────────────────────────────────────────────────────────┤
│                                                         │
│          ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░               │
│                                                         │
│   It was a bright cold day in April, and the           │
│   clocks were striking thirteen. Winston Smith,        │  ← Szöveg terület
│   his chin nuzzled into his breast in an effort        │    max-width: 680px
│   to escape the vile wind, slipped quickly            │    margin: auto
│   through the glass doors of Victory Mansions...      │
│                                                         │
│          ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░               │
│                                                         │
├─────────────────────────────────────────────────────────┤
│  [◀] [▶▶] ████████░░░░░░░░░░ 12:34 / 45:20  [🔊] [1x] │  ← Mini Player (fixed bottom)
└─────────────────────────────────────────────────────────┘
```

### 2.3 Reading Mode belépési pont

- Gomb a book detail oldalon: `📖 Olvasási mód` → fullscreen overlay
- Billentyűparancs: `F` billentyű (olvasás közben)
- Kilépés: `Esc` vagy `✕` gomb
- Browser `fullscreen API` opcionálisan aktiválható

### 2.4 Szöveg-audio szinkron vizualizáció Reading Mode-ban

- Az aktuálisan **felolvasott mondat** sárga háttérrel kiemelve
- Az előző mondatok halványabb szürke szövegszínnel
- A szöveg **automatikusan scrollozódik** az aktuális pozícióhoz
- Kattintásra a megfelelő audio pozícióra ugrik (meglévő funkció megtartva)

---

## 3. Betűméret és Tipográfia Vezérlők

### 3.1 Inline vezérlők (Reading Mode-ban)

A képernyő sarkában lebegő **Typography Panel** (összecsukható):

```
┌──────────────────────────┐
│  🔤 Szöveg beállítások   │
├──────────────────────────┤
│ Betű: [Literata      ▼]  │
│ Méret: [A-] [18px] [A+]  │
│ Sor:   [━━━●━━━━] 1.7    │
│ Szó:   [━━●━━━━━] 0em    │
│ Betű:  [━●━━━━━━] 0em    │
│ Széles:[━━━━●━━━] 680px  │
├──────────────────────────┤
│ Téma: ○Fehér ○Szépia     │
│       ○Sötét  ○Fekete    │
└──────────────────────────┘
```

### 3.2 Gyorsbillentyűk

| Billentyű | Hatás |
|---|---|
| `+` / `-` | Betűméret +2 / -2px |
| `Ctrl+0` | Alapértelmezett beállítások visszaállítása |
| `T` | Téma váltása (körkörösen) |
| `F` | Reading Mode be/ki |

### 3.3 Értéktartományok

| Beállítás | Min | Max | Lépés | Default |
|---|---|---|---|---|
| Betűméret | 12px | 32px | 1px | 18px |
| Sortávolság | 1.2 | 2.5 | 0.1 | 1.7 |
| Szóköz | 0em | 1em | 0.05em | 0em |
| Betűköz | -0.05em | 0.3em | 0.01em | 0em |
| Szövegoszlop | 480px | 900px | 20px | 680px |

---

## 4. Olvasási és Lejátszási Pozíció Mentése

### 4.1 Jelenlegi állapot

A `PlaybackState` modell már létezik a backenden – tárolja az audio pozíciót (`current_position`, `current_chapter_id`).

### 4.2 Bővítés: Reading State

Új `ReadingState` (vagy a `PlaybackState` kibővítése):

```python
# backend/app/models.py – új tábla vagy PlaybackState bővítése
class ReadingState(Base):
    __tablename__ = "reading_states"

    id: int
    user_id: int                    # FK → User
    book_id: int                    # FK → Book

    # Olvasási pozíció
    current_chapter_id: int         # Aktuális fejezet
    scroll_position: float          # Scroll % az oldalon (0.0–1.0)
    text_chunk_index: int           # Aktuális szövegrész index
    reading_progress: float         # Könyv teljes haladása % (0.0–1.0)

    # Audio pozíció (átveszi a PlaybackState-ből)
    audio_position: float           # Másodperc
    voice_id: int | None            # Melyik hanggal

    updated_at: datetime
```

**API végpontok:**
```
GET  /api/reading/{book_id}           → ReadingState lekérése
PUT  /api/reading/{book_id}           → ReadingState mentése
GET  /api/books/{book_id}/progress    → Olvasási % summary
```

### 4.3 Frontend – Auto-save

- Mentés **debounce-olva** (5 másodpercenként vagy scroll-stop után)
- Mentés fejezet-váltáskor
- Mentés kilépéskor (`beforeunload` event)
- **Vizuális visszajelzés:** diszkrét `✓ Elmentve` toast

### 4.4 Folytatás prompt

Könyv megnyitásakor:
```
┌────────────────────────────────────────┐
│  📍 Folytassa ott, ahol abbahagyta?    │
│                                         │
│  3. fejezet – 34%-nál                  │
│  (legutóbb 2026-03-07, 21:34)          │
│                                         │
│  [Folytatás]          [Az elejéről]    │
└────────────────────────────────────────┘
```

---

## 5. Olvasási Témák

### 5.1 Beépített témák

| Téma | Háttér | Szöveg | Akcentus | Leírás |
|---|---|---|---|---|
| **Fehér** | `#FFFFFF` | `#1A1A1A` | `#2563EB` | Klasszikus, nappali olvasás |
| **Szépia** | `#F5F0E8` | `#3B2F1E` | `#8B5E3C` | Papír-feel, meleg hangulat |
| **Szürke** | `#F0F0F0` | `#2A2A2A` | `#4A4A8A` | Kontrasztos, de nem fehér |
| **Sötét** | `#1A1A2E` | `#E8E8E8` | `#6C8EF5` | Éjszakai olvasás, kék árnyalat |
| **Fekete** | `#000000` | `#CCCCCC` | `#888888` | OLED-barát, max. szemkímélet |
| **Erdő** | `#1C2B1A` | `#D4E8D0` | `#7BC67B` | Természetes zöld sötét téma |
| **Napfelkelte** | `#FFF8F0` | `#2D1B00` | `#E07A5F` | Meleg, reggeli olvasás |

### 5.2 Egyéni téma

A user settings oldalon custom szín-picker (háttér + szövegszín), kontrasztarány ellenőrzővel (WCAG AA minimum).

---

## 6. Fejezet Navigáció Reading Mode-ban

### 6.1 Fejezet panel (oldalról csúszó)

```
[☰] gombra → balra csúszó panel:

┌──────────────────────┐
│ 📚 Fejezetek         │
├──────────────────────┤
│ ✓ 1. Bevezetés  100% │
│ ✓ 2. Az utazás   87% │
│ ► 3. A vihar     34% │  ← aktuális
│   4. Megérkezés   0% │
│   5. Epilógus     0% │
│   ...                │
├──────────────────────┤
│ 📊 Összesített: 42%  │
│ ⏱ ~3h 20min maradt  │
└──────────────────────┘
```

### 6.2 Progress bar

Tetején: vékony, könyvben lévő össz-haladást jelző vonal (pl. Kindle-stílusban).

---

## 7. Prémium UX Feature Javaslatok

### 7.1 Intelligens szövegkiemelés (Smart Highlight)

- Szövegkijelöléskor: **"Kiemelés"** és **"Megjegyzés"** opció popup
- Kiemelések színkódolva tárolva, export lehetőséggel (JSON/Markdown)
- Statisztikák: hány szót emelt ki, milyen fejezeteknél

### 7.2 Olvasási statisztikák

```
📊 Olvasási napló
├── Mai olvasás: 42 perc, 3 fejezet
├── Heti átlag: 28 perc/nap
├── Becsült befejezés: 2026-03-15
├── Olvasási sebesség: ~280 szó/perc
└── Könyv befejezések: 7
```

### 7.3 Szótár integráció (Dictionary Lookup)

- Szó kiemelésére → gyors szótár popup (Wiktionary API)
- Hangos kiejtés gomb a popup-ban
- Mentett szavak lista (szószedet export)

### 7.4 Olvasási célok (Reading Goals)

- Napi olvasási cél beállítása (pl. 20 perc/nap)
- Streak-követés (hány napja olvasott egymás után)
- Gamification: könyvjelzők, jelvények, befejezési animáció

### 7.5 Text-to-Speech szinkronizáció fejlesztése

- **Dual view mód:** bal oldalt szöveg, jobb oldalt waveform/timeline vizualizáció
- **Sebességváltó shortcut:** `[` lassabb, `]` gyorsabb (0.5x–3.0x)
- **Fejezet replay:** adott mondat újra lejátszása kattintással
- **A-B ismétlés:** jelölt szakasz ismétlése (nyelvtanuláshoz)

### 7.6 Könyvjelző rendszer

- `B` billentyű → könyvjelző az aktuális pozícióhoz
- Könyvjelzők listája a fejezet panelban
- Szinkronizálva audio pozícióval is (kattintásra oda ugrik)

### 7.7 Eye-strain Protection

- **Olvasási szünet emlékeztető** (pl. 30 percenként)
- **Auto dim:** napszakhoz igazított fényerő ajánlat
- **Blue light filter slider** a téma beállításokban
- **Betűsimítás bekapcsolás/ki** (`font-smooth` vezérlés)

### 7.8 Billentyűzet és gesztus navigáció

| Input | Hatás |
|---|---|
| `Space` | Lejátszás / Szünet |
| `←` / `→` | -10s / +10s skip |
| `Ctrl+←` / `Ctrl+→` | Előző / Következő fejezet |
| `↑` / `↓` | Görgetés (reading mode) |
| `F` | Reading mode toggle |
| `T` | Téma váltás |
| `+` / `-` | Betűméret |
| `B` | Könyvjelző |
| Swipe left/right (mobile) | Fejezet váltás |
| Pinch zoom (mobile) | Betűméret |

### 7.9 Offline olvasás (PWA)

- Service Worker + Cache API: letöltött fejezetek offline olvashatók
- Audio fájlok pre-cache (ha generált)
- Offline indicator az UI-ban

### 7.10 Social / Sharing

- **Szövegrészlet megosztás:** kiemelt idézet + könyvcím, share card generálás
- **Könyv befejezési kártya:** megosztható statisztika kártya

### 7.11 Accessibility (Akadálymentesség)

- Teljes ARIA label rendszer
- High contrast mód
- Screen reader kompatibilitás
- Redukált mozgás (`prefers-reduced-motion`) tiszteletben tartása
- Minimális 4.5:1 kontrasztarány minden témánál (WCAG AA)

---

## 8. Beállítások Oldal Terv (`/settings/reading`)

### 8.1 Struktúra

```
⚙️ Olvasási Beállítások
│
├── 🔤 Tipográfia
│   ├── Betűtípus választó (vizuális preview kártyákkal)
│   ├── Betűméret slider
│   ├── Sortávolság slider
│   ├── Szóköz slider
│   ├── Betűköz slider
│   └── Szövegoszlop szélesség slider
│
├── 🎨 Megjelenés
│   ├── Téma választó (előnézeti kártyák)
│   └── Egyéni téma (color picker)
│
├── 📖 Olvasási élmény
│   ├── Reading mode default (on/off)
│   ├── Auto-scroll sebesség
│   ├── Szinkronizált kiemelés (on/off)
│   ├── Olvasási szünet emlékeztető (perc)
│   └── Billentyűparancsok testreszabása
│
├── 🔊 Lejátszás
│   ├── Alapértelmezett lejátszási sebesség
│   ├── Auto-play következő fejezet (on/off)
│   └── Hang normalizálás (on/off)
│
└── 📊 Statisztikák & Célok
    ├── Napi olvasási cél (perc)
    └── Streak adatok
```

### 8.2 Preview Panel

A beállítások oldal jobb felén egy **élő előnézeti szövegpanel**, amely azonnal mutatja a változások hatását (dummy lorem ipsum szöveggel).

---

## 9. Implementációs Ütemterv

### Phase 1 – Alap tipográfia és Reading Mode (1-2 hét)

- [ ] UserSettings bővítése (backend)
- [ ] Font betöltés (next/font/google) és CSS változó rendszer
- [ ] ReadingSettingsContext (frontend)
- [ ] Reading Mode fullscreen overlay komponens
- [ ] Mini player (fixed bottom, Reading Mode-ban)
- [ ] Inline Typography Panel (lebegő gomb)
- [ ] Betűméret gyorsbillentyűk (`+`/`-`)

### Phase 2 – Pozíció mentés és Haladás (1 hét)

- [ ] ReadingState backend modell + migration
- [ ] API végpontok (GET/PUT reading state)
- [ ] Frontend auto-save (debounce, beforeunload)
- [ ] "Folytatás ott, ahol abbahagyta" prompt
- [ ] Fejezet progress %-ok megjelenítése

### Phase 3 – Témák és Vizuális Finomítás (1 hét)

- [ ] 7 beépített téma implementálása
- [ ] Custom téma color picker + kontrasztarány validáció
- [ ] Téma váltás animáció (smooth transition)
- [ ] Beállítások oldal (`/settings/reading`) preview panellel

### Phase 4 – Prémium Feature-ök (2-3 hét)

- [ ] Könyvjelző rendszer
- [ ] Szövegkiemelés és megjegyzések
- [ ] Olvasási statisztikák
- [ ] Szótár integráció
- [ ] Billentyűzet shortcut rendszer (teljes)
- [ ] Olvasási célok és streak

### Phase 5 – PWA és Accessibility (1-2 hét)

- [ ] Service Worker + offline cache
- [ ] ARIA rendszer audit
- [ ] WCAG AA kontrasztarány ellenőrzés minden témánál
- [ ] Mobile gesztus navigáció
- [ ] Redukált mozgás support

---

## 10. Technikai Döntések és Indoklások

| Döntés | Indoklás |
|---|---|
| `next/font/google` a font betöltéshez | Zero layout shift, automatikus optimalizálás, self-hosting |
| CSS Custom Properties a tipográfiához | Egyetlen context update → teljes UI frissül, nincs re-render |
| Debounce auto-save (5s) | Csökkenti API hívások számát, de nem veszít adatot |
| `beforeunload` + visibility change | Mobilon is megbízható mentés (app háttérbe kerülésekor) |
| Tailwind + CSS vars kombinálva | Tailwind a layout-hoz, CSS vars a dinamikus tipográfiához |
| Literata mint default font | Kifejezetten digitális olvasásra tervezve, Google Books is ezt használja |
| ReadingSettingsContext | Globálisan elérhető, localStorage-ba is mentve (instant load) |

---

## 11. Fájlok és Komponensek (létrehozandó/módosítandó)

### Új fájlok (Frontend)
```
frontend/src/
├── contexts/
│   └── ReadingSettingsContext.tsx    # Globális olvasási beállítások
├── components/
│   ├── ReadingMode/
│   │   ├── ReadingModeOverlay.tsx    # Fullscreen olvasási mód
│   │   ├── MiniPlayer.tsx            # Fixed bottom audio player
│   │   ├── TypographyPanel.tsx       # Lebegő beállítások panel
│   │   ├── ChapterSidebar.tsx        # Fejezet navigáció panel
│   │   └── ReadingProgress.tsx       # Progress bar komponens
│   ├── FontSelector.tsx              # Betűtípus választó kártyák
│   ├── ThemeSelector.tsx             # Téma választó
│   └── ResumePrompt.tsx              # "Folytatás" modal
└── app/
    └── settings/
        └── reading/
            └── page.tsx              # Olvasási beállítások oldal
```

### Módosítandó fájlok (Frontend)
```
frontend/src/
├── app/books/[id]/page.tsx           # Reading Mode gomb + ResumePrompt
└── app/layout.tsx                    # Font betöltés, ReadingSettingsContext provider
```

### Új fájlok (Backend)
```
backend/app/
├── models.py                         # ReadingState modell hozzáadása
├── schemas.py                        # ReadingState Pydantic sémák
└── routers/
    └── reading.py                    # /api/reading/ végpontok
```

### Módosítandó fájlok (Backend)
```
backend/app/
├── main.py                           # reading router regisztrálása
└── models.py                         # UserSettings tipográfia mezők
```

---

## Referenciák és Inspiráció

- **Kindle** – Betűtípus választó, margó vezérlők, téma rendszer
- **Apple Books** – Smooth animációk, Night Mode, auto-scroll
- **Readwise Reader** – Kiemelések, szóköz-vezérlők, focus mode
- **Instapaper** – Minimalista olvasási mód, szépia téma
- **Literata font** – [fonts.google.com/specimen/Literata](https://fonts.google.com/specimen/Literata)
- **Atkinson Hyperlegible** – [brailleinstitute.org/freefont](https://brailleinstitute.org/freefont)
- **WCAG 2.1 Color Contrast** – min. 4.5:1 normál szövegnél

---

*Terv készítője: Claude Code AI Assistant*
*Utolsó frissítés: 2026-03-08*
