# Phase 2: UI Overhaul — Design Document

**Date**: 2026-03-06
**Status**: Approved
**Parent**: `docs/plans/2026-03-04-saas-transformation-design.md` (Phase 2)
**Depends on**: Phase 1 Auth & User Module (completed)

## Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Navigation | Sidebar (left) | Design doc layout, better scalability |
| Player | Persistent bar + inline coexist | Best UX for both browsing and reading |
| Theme | Dark only (no light mode) | Not priority, reduces scope |
| Library search/filter | Client-side minimal | Sufficient for current scale |
| BookCard time | Listening duration | From completed chapters' duration_seconds |
| Settings save | Explicit Save button | User preference over auto-save |
| Approach | Top-down (B) | Layout first, then new pages, then upgrades |

## Architecture

### Layout Structure

```
┌──────────────────────────────────────────────────────┐
│  TopBar: [Logo]              [Credits: 24] [Avatar ▼]│
├──────────┬───────────────────────────────────────────┤
│ Sidebar  │                                           │
│ (240px)  │     Main Content Area (flex-1)            │
│          │                                           │
│ Library  │                                           │
│ Voices   │                                           │
│ Queue    │                                           │
│ ──────── │                                           │
│ Profile  │                                           │
│ Settings │                                           │
│ ──────── │                                           │
│ Upgrade  │                                           │
├──────────┴───────────────────────────────────────────┤
│  PlayerBar: [◁◁ ▶ ▷▷] Ch.3 — Book  [███░░ 3:42/12:30]│
└──────────────────────────────────────────────────────┘
```

### New Files

| File | Purpose |
|------|---------|
| `components/Sidebar.tsx` | Left nav with icons, labels, active state |
| `components/TopBar.tsx` | Credits badge, user avatar dropdown |
| `components/PlayerBar.tsx` | Persistent bottom player bar |
| `lib/player-context.tsx` | Global audio state (PlayerProvider) |
| `app/profile/page.tsx` | User profile + credits |
| `app/settings/page.tsx` | User settings with Save button |

### Modified Files

| File | Change |
|------|--------|
| `app/layout.tsx` | Sidebar + TopBar + PlayerBar shell |
| `components/BookCard.tsx` | Redesign: cover, progress, duration, language |
| `app/page.tsx` | Add search bar + sort dropdown |
| `app/books/[id]/page.tsx` | Use PlayerContext for audio |
| `components/Navbar.tsx` | Remove (replaced by Sidebar + TopBar) |
| `components/Player.tsx` | Remove (replaced by PlayerBar) |

## Component Designs

### Sidebar

- Width: 240px fixed (desktop), 64px collapsed (tablet), overlay (mobile)
- Icons: lucide-react
- Active state: bg-gray-800 + left border indigo-500
- Dividers between groups: main nav, user, upgrade
- Mobile: hamburger icon in TopBar opens overlay sidebar

### TopBar

- Height: ~56px
- Left: App logo/name
- Right: Credits badge (blue pill), user avatar dropdown
- Dropdown: Profile, Settings, Sign Out

### BookCard (Redesigned)

```
┌─────────────────────────────┐
│  ┌─────┐                    │
│  │COVER│  Book Title         │
│  │ 📕  │  by Author          │
│  └─────┘                    │
│  ████████░░░░ 65% (8/12)    │
│  🎙️ VoiceName   📖 hu       │
│  ⏱️ 4h 32min                │
└─────────────────────────────┘
```

- Cover placeholder: gradient from title hash
- Progress: done_chapters / total_chapters (green bar)
- Duration: sum of done chapters' duration_seconds (formatted h:mm)
- Language badge from voice
- "Converting..." pulse animation if processing jobs exist

### PlayerContext (Global State)

```typescript
interface PlayerState {
  bookId: number | null;
  chapterId: number | null;
  audioUrl: string | null;
  bookTitle: string;
  chapterTitle: string;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
}

// Methods: play(), pause(), seek(), skipChapter()
// Single <audio> element lives in PlayerProvider
```

### Persistent Player Bar

```
┌────────────────────────────────────────────────────────┐
│  ◁◁  ▶  ▷▷  │  Ch.3 — Egri Csillagok │  ███░░ 3:42/12:30│
│              │  🎙️ Voice1             │  1x ▼  🔊 ████   │
└────────────────────────────────────────────────────────┘
```

- Hidden when no audio is active
- Controls: prev/next chapter, play/pause, seekable progress
- Speed control: 0.5x – 2x
- Volume slider (desktop only)

### Profile Page (`/profile`)

- User info: email, avatar initials, member since
- Credit balance (big number)
- Credit transaction history (list, +green/-red)
- API: `GET /api/users/me`, `GET /api/users/me/credits`, `GET /api/users/me/credits/history`

### Settings Page (`/settings`)

- Playback: default speed dropdown, audio quality dropdown
- Notifications: email on completion checkbox
- Account: Delete Account button (danger zone)
- Explicit **Save** button (disabled until changes, success toast on save)
- API: `GET/PUT /api/users/me/settings`

### Library Page Enhancements

- Search bar: client-side filter by title + author (debounced input)
- Sort dropdown: Recently added | Title A-Z | Author A-Z
- Grid: 1 col (mobile) → 2 col (tablet) → 3 col (desktop)
- Better empty state design

## Responsive Breakpoints

| Breakpoint | Sidebar | Player Bar | Grid |
|------------|---------|------------|------|
| < 768px (mobile) | Hamburger overlay | Compact (no volume) | 1 col |
| 768–1024px (tablet) | Collapsed (icons only, 64px) | Full | 2 col |
| > 1024px (desktop) | Full (240px) | Full | 3 col |

## Implementation Order (Top-Down)

1. Sidebar + TopBar + layout shell
2. Profile page
3. Settings page
4. BookCard redesign + Library enhancements
5. PlayerContext + PlayerBar
6. Book detail page integration with PlayerContext
7. Mobile responsive polish
