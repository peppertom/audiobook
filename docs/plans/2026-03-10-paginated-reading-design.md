# Paginated Reading Mode — Design

**Date:** 2026-03-10
**Status:** Approved

## Overview

Replace the current scrollable reading mode overlay with a paginated, book-like view. The frontend calculates page breaks client-side using DOM measurement (probe div technique), respecting the user's typography settings. Navigation works via keyboard, click/tap zones, and mobile swipe gestures.

## Architecture

### New files
- `frontend/src/hooks/usePagination.ts` — pagination logic, returns `pages: string[][]`, `pageCount`, `isCalculating`
- `frontend/src/components/ReadingMode/PageView.tsx` — renders a single page's paragraphs

### Modified files
- `frontend/src/components/ReadingMode/ReadingModeOverlay.tsx` — replace scroll div with page view, add navigation, page indicator

## Pagination Algorithm (Probe Div)

A hidden `div` is created off-screen (`position: absolute; top: -9999px; visibility: hidden; overflow: hidden`) and given:
- Exact same styles as the reading view: `fontFamily`, `fontSize`, `lineHeight`, `wordSpacing`, `letterSpacing`, `maxWidth`, `padding`
- Fixed height: `pageHeight = window.innerHeight − headerHeight − miniPlayerHeight − verticalPadding`

Paragraphs are appended one by one. After each append, if `probeDiv.scrollHeight > probeDiv.clientHeight`, the last paragraph is removed and a new page starts with that paragraph.

**Edge case:** A single paragraph taller than the page (e.g. very long unbroken text) is forced onto its own page to prevent infinite loops.

**Recalculation triggers:** `fontSize`, `lineHeight`, `fontFamily`, `maxWidth`, `wordSpacing`, `letterSpacing` — debounced 200ms after change.

**During recalculation:** current page index is preserved as a fraction (`pageIndex / oldPageCount`) and restored proportionally in the new page count.

## Navigation

### Keyboard
- `ArrowRight`, `ArrowLeft`, `PageDown`, `PageUp` — next/prev page
- `Escape` — close (unchanged)
- `T`, `L`, `+`, `-` — typography shortcuts (unchanged)

### Click zones
- Left half of screen → previous page
- Right half of screen → next page
- Hover: subtle `<` / `>` arrow indicator fades in at screen edges

### Mobile swipe
- Touch swipe right → previous page
- Touch swipe left → next page
- Threshold: 50px horizontal movement with < 75px vertical drift to prevent accidental triggers

### Chapter boundary
- Next page on last page → `onChapterSelect(nextChapter)` (existing behaviour)
- Prev page on first page → `onChapterSelect(prevChapter)`

## UI Elements

### Page indicator
- Positioned above the MiniPlayer, centered
- Format: `3 / 17`
- Subtle opacity (40%), slightly larger on hover

### Loading state
- While `isCalculating`: show `"Számolás..."` in center, same position as page indicator
- Brief (typically < 100ms on modern hardware)

### Page turn
- No animation (instant swap) — cleanest reading experience, no distraction

## Progress Saving

Replace scroll-based progress with page-based:
- `scroll_position`: `pageIndex / (pageCount - 1)` — normalized 0–1
- `paragraph_index`: index of first paragraph on current page

On resume: restore to nearest page containing `paragraph_index`.

## Removed Features

- `focusLine` (focus line dimming) — only meaningful for scrolling, removed from paginated mode
- Scroll-based header auto-hide — header stays visible (or timed auto-hide after 3s of inactivity)

## Components Summary

```
ReadingModeOverlay
├── header (unchanged)
├── PageView (new) — renders pages[currentPage]
│   └── paragraphs with same styling as before
├── Navigation overlays — left/right click zones with hover arrows
├── Page indicator — "3 / 17" above MiniPlayer
├── TypographyPanel (unchanged, floating)
├── ChapterSidebar (unchanged)
└── MiniPlayer (unchanged)
```

## Hook API

```ts
usePagination(
  paragraphs: string[],
  containerHeight: number,
  typographyStyles: TypographyStyles
): {
  pages: string[][];
  pageCount: number;
  isCalculating: boolean;
}
```
