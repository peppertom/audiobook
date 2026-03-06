# Phase 2: UI Overhaul — Implementation Tasks

**Module**: Frontend UI overhaul (sidebar, player, profile, settings, library)
**Status**: Not started
**Depends on**: Phase 1 Auth & User Module (completed)
**Design doc**: `docs/plans/2026-03-06-phase2-ui-overhaul-design.md`

## Decisions

| Decision | Choice |
|----------|--------|
| Navigation | Sidebar (240px, bal oldal) |
| Player | Persistent bar + inline ChapterPlayer szinkronban |
| Theme | Dark only (nincs light mode) |
| Library | Client-side search + sort |
| BookCard | Cover placeholder, progress bar, hallgatasi ido |
| Settings | Explicit Save gomb |
| Approach | Top-down: layout → uj oldalak → upgrade → player → responsive |

## Current State

**Ami VAN:**
- `app/layout.tsx` — AuthProvider + Navbar, max-w-6xl container
- `components/Navbar.tsx` — top navbar (Library, Voices, Queue, user dropdown)
- `components/BookCard.tsx` — minimal (17 sor: cim, szerzo, fejezet szam)
- `components/Player.tsx` — nem hasznalt bottom player
- `app/page.tsx` — Library: FileUpload + BookCard grid
- `app/books/[id]/page.tsx` — inline ChapterPlayer text sync-kel
- `app/queue/page.tsx` — job monitor JSON progress-szel
- `lib/auth-context.tsx` — JWT auth (login/register/logout)
- `lib/api.ts` — minden API endpoint (user, books, voices, jobs, playback, credits)

**Ami NINCS:**
- ❌ Sidebar layout
- ❌ TopBar component
- ❌ PlayerContext (globalis audio state)
- ❌ Persistent PlayerBar
- ❌ `/profile` page
- ❌ `/settings` page
- ❌ BookCard redesign (cover, progress, duration)
- ❌ Library search/sort
- ❌ Mobile hamburger menu

---

## Task 1: Sidebar + TopBar + Layout Shell

**Fajlok:**
- Letrehoz: `frontend/src/components/Sidebar.tsx`
- Letrehoz: `frontend/src/components/TopBar.tsx`
- Modosit: `frontend/src/app/layout.tsx`
- Torol: `frontend/src/components/Navbar.tsx` (funkcionalitasa Sidebar + TopBar-ba kerul)

**Lepesek:**

1. `Sidebar.tsx` letrehozasa:
   - Nav linkek: Library (`/`), Voices (`/voices`), Queue (`/queue`), divider, Profile (`/profile`), Settings (`/settings`), divider, Upgrade
   - Ikonok: lucide-react (Library, Mic, ListOrdered, User, Settings, Gem)
   - Active state: `usePathname()` → bg-gray-800 + border-l-2 border-indigo-500
   - Fixed width: 240px, bg-gray-900, border-r border-gray-800
   - Fejlec: app logo/nev

2. `TopBar.tsx` letrehozasa:
   - Flex row, h-14, bg-gray-900, border-b border-gray-800
   - Bal: hamburger gomb (mobile only, toggle sidebar)
   - Jobb: Credits badge (kek pill, getCredits() API), User avatar dropdown
   - Dropdown: Profile, Settings, Sign Out (useAuth() hook-bol)

3. `layout.tsx` atirasa:
   - Toroljuk a Navbar import-ot
   - Uj layout: `flex h-screen` → Sidebar | (TopBar + main + PlayerBar placeholder)
   - Main: `flex-1 overflow-y-auto p-6`
   - PlayerBar: placeholder div (Task 5-ben lesz kitoltve)

4. Navbar.tsx eltavolitasa (vagy ures fajl ha mas importalja)

**Validacio:**
- Minden oldal megjelenik sidebar-ral
- Active link kiemelve az aktualis oldalnal
- Navigation mukodik (kattintas → oldal valtas)
- User dropdown: Profile, Settings, Sign Out

**Commit:** `feat: add sidebar navigation and top bar layout`

---

## Task 2: Profile page

**Fajlok:**
- Letrehoz: `frontend/src/app/profile/page.tsx`

**Lepesek:**

1. User info szekio:
   - Avatar: initials kor (elso betu, bg szin email hash-bol)
   - Email, member since (created_at formatazva)
   - API: `getCurrentUser()` → UserProfile

2. Credits szekio:
   - Nagy szam: balance
   - "Buy More Credits" gomb (placeholder — Phase 3 Stripe)
   - API: `getCreditBalance()` → number

3. Credit history szekio:
   - Lista: datum, amount (+zold/-piros), type, description
   - API: `getCreditHistory()` → CreditTransaction[]
   - Ures state ha nincs tranzakcio

**Validacio:**
- `/profile` betolt, adatok megjelennek
- Credit history lista helyes
- Sidebar "Profile" link aktiv

**Commit:** `feat: add profile page with credits and transaction history`

---

## Task 3: Settings page

**Fajlok:**
- Letrehoz: `frontend/src/app/settings/page.tsx`

**Lepesek:**

1. Form feluleti elemek:
   - Playback speed: dropdown (0.5x, 0.75x, 1.0x, 1.25x, 1.5x, 2.0x)
   - Audio quality: dropdown (Standard, High)
   - Email notifications: checkbox
   - API: `getUserSettings()` betoltes, `updateUserSettings()` mentes

2. Save mechanizmus:
   - State tracking: `hasChanges` boolean (kezdeti ertek vs aktualis)
   - Save gomb: disabled ha nincs valtozas, loading state mentes kozben
   - Sikeres mentes → success toast / uunet (zold feedback)
   - Hiba → error megjelentes

3. Danger zone:
   - "Delete Account" gomb (piros)
   - Confirmation dialog megjelentes
   - Meg nem implementalt backend endpoint → disabled/placeholder

**Validacio:**
- `/settings` betolt, jelenlegi beallitasok megjelennek
- Valtozas utan Save gomb aktiv
- Mentes sikeres, feedback megjelenik

**Commit:** `feat: add settings page with save functionality`

---

## Task 4: BookCard redesign + Library enhancements

**Fajlok:**
- Modosit: `frontend/src/components/BookCard.tsx`
- Modosit: `frontend/src/app/page.tsx`
- Modosit: `frontend/src/lib/api.ts` (Book tipus bovites ha szukseges)

**Lepesek:**

1. `BookCard.tsx` ujrairas (~80-100 sor):
   - Cover placeholder: szin-gradient a konyvicm hash-abol
   - Cim + szerzo (truncated)
   - Progress bar: `chapters_done / chapters_total` (zold)
   - Hallgatasi ido: `total_duration_seconds` → "Xh Ymm" formatumban
   - Nyelv badge: voice language-bol (kis pill)
   - "Converting..." animacio ha van processing/queued job
   - Kattintas → `/books/[id]`

2. API/tipus bovites:
   - Book tipus: `chapters_done`, `chapters_total`, `total_duration_seconds`, `has_active_jobs` mezok
   - Vagy: a frontend szamolja ki a Chapter[] es Job[] adatokbol
   - Lehetoseg: backend GET /api/books bovites aggregalt adatokkal

3. `page.tsx` (Library) bovites:
   - Search bar: `<input>` + useState, filter books client-side (title + author includes)
   - Sort dropdown: Recently added (created_at desc) | Title A-Z | Author A-Z
   - Debounced search (300ms)
   - Filtered/sorted lista megjelenites
   - Jobb empty state design

**Validacio:**
- BookCard uj designnal megjelenik
- Progress bar helyes
- Search filter mukodik (gepeles → lista szurul)
- Sort valtas → lista ujrarendezodik
- Ures state szep

**Commit:** `feat: redesign book cards with progress and enhance library with search/sort`

---

## Task 5: PlayerContext + Persistent PlayerBar

**Fajlok:**
- Letrehoz: `frontend/src/lib/player-context.tsx`
- Letrehoz: `frontend/src/components/PlayerBar.tsx`
- Modosit: `frontend/src/app/layout.tsx` (PlayerProvider + PlayerBar)

**Lepesek:**

1. `player-context.tsx`:
   - PlayerState interface: bookId, chapterId, audioUrl, bookTitle, chapterTitle, voiceName, isPlaying, currentTime, duration
   - Egyetlen `<audio>` element a Provider-ben (ref)
   - Methods: `play(bookId, chapterId, audioUrl, titles)`, `pause()`, `togglePlay()`, `seek(time)`, `setSpeed(rate)`, `setVolume(vol)`
   - `skipChapter(direction: 1 | -1)` — ehhez kell a konyviadatok (chapters lista)
   - Playback state mentes: `savePlaybackState()` API hivas (debounced, 5mp-enkent)
   - Playback restore: `loadPlaybackState(bookId)` — utolso pozicio visszaallitasa

2. `PlayerBar.tsx`:
   - Csak megjelenik ha `playerState.audioUrl !== null`
   - Prev/Next chapter gombok
   - Play/Pause gomb (nagy, kozepen)
   - Seekable progress bar (kattinthato)
   - Ido kijelzes: currentTime / duration
   - Konyv cim + fejezet cim (kattinthato → navigal `/books/[id]`)
   - Speed control: dropdown (0.5x – 2x)
   - Volume slider (desktop only)
   - Fix pozicio: layout aljan, a sidebar felett (z-index)

3. `layout.tsx` modositas:
   - `<PlayerProvider>` wrapper az `<AuthProvider>` utan
   - `<PlayerBar />` a main area aljan (a sidebar mellett)

**Validacio:**
- PlayerBar megjelenik ha egy fejezet audioját elindítjuk
- Play/pause, seek, speed control mukodik
- Navigacio masik oldalra → zene tovabb szol
- PlayerBar eltűnik ha nincs audio

**Commit:** `feat: add global player context and persistent player bar`

---

## Task 6: Book detail page — PlayerContext integracio

**Fajlok:**
- Modosit: `frontend/src/app/books/[id]/page.tsx`

**Lepesek:**

1. ChapterPlayer modositas:
   - A helyi `<audio>` element eltavolitasa
   - `usePlayer()` hook hasznalata a PlayerContext-bol
   - Play gomb → `player.play(bookId, chapter.id, audioUrl, { bookTitle, chapterTitle, voiceName })`
   - Az isPlaying/currentTime a context-bol jon
   - A text sync tovabbra is mukodik (currentTime-bol szamolja)

2. Active chapter kiemelese:
   - Ha `player.chapterId === chapter.id` → kiemelt hatter (border-blue)
   - Play gomb allapota szinkronban a playerbar-ral

3. Chapter navigacio:
   - skipChapter() → a kovetkezo/elozo fejezetre ugrik
   - Chapters lista atadasa a PlayerContext-nek

**Validacio:**
- Chapter play gomb → PlayerBar megjelenik es szinkronban
- Text sync tovabbra is mukodik
- Navigacio masik oldalra → audio tovabb szol a PlayerBar-on
- Vissza navigacio → chapter is synced

**Commit:** `feat: integrate book detail with global player context`

---

## Task 7: Mobile responsive + polish

**Fajlok:**
- Modosit: `frontend/src/components/Sidebar.tsx`
- Modosit: `frontend/src/components/TopBar.tsx`
- Modosit: `frontend/src/components/PlayerBar.tsx`
- Modosit: `frontend/src/app/layout.tsx`

**Lepesek:**

1. Mobile sidebar (< 768px):
   - Sidebar rejtes default-ban
   - TopBar hamburger gomb → sidebar overlay (slide-in bal oldalt)
   - Overlay backdrop (kattintas bezar)
   - Link kattintas → sidebar bezar

2. Tablet sidebar (768–1024px):
   - Osszecsukas: csak ikonok (64px szeles)
   - Hover tooltip a link nevevel
   - Toggle gomb a teljes/ikon nezet kozott

3. PlayerBar responsive:
   - Mobile: kompakt (nincs volume slider, rovidebb cim)
   - Tablet/Desktop: teljes

4. Grid responsive (mar nagyreszint megvan):
   - Ellenorizni: 1 col mobile, 2 col tablet, 3 col desktop

**Validacio:**
- Mobile: hamburger menu nyit/zar, sidebar overlay
- Tablet: sidebar osszecsukas/kinyitas
- Desktop: teljes sidebar
- PlayerBar responsiv minden méreten

**Commit:** `feat: add responsive sidebar, player bar, and mobile support`

---

## Osszefoglalo

| # | Task | Fajlok | Tipus |
|---|------|--------|-------|
| 1 | Sidebar + TopBar + Layout | 3 uj + 1 modosit + 1 torol | Layout |
| 2 | Profile page | 1 uj | Page |
| 3 | Settings page | 1 uj | Page |
| 4 | BookCard + Library | 2 modosit + 1 modosit | Component + Page |
| 5 | PlayerContext + PlayerBar | 2 uj + 1 modosit | Context + Component |
| 6 | Book detail integracio | 1 modosit | Page |
| 7 | Mobile responsive | 4 modosit | Polish |

**Vegrehajtas sorrend:**
```
Task 1 (Sidebar + Layout)
  └→ Task 2 (Profile page)
  └→ Task 3 (Settings page)
  └→ Task 4 (BookCard + Library)
  └→ Task 5 (PlayerContext + PlayerBar)
       └→ Task 6 (Book detail integracio)
  └→ Task 7 (Mobile responsive — utolso)
```

Task 2, 3, 4 parhuzamosan indithatok Task 1 utan.
Task 5 es 6 szekvencialisan (6 fugg 5-tol).
Task 7 a legvegen (minden mas keszen kell legyen).

**Becsult ido:** 2-3 nap
