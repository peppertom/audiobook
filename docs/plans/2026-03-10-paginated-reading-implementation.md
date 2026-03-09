# Paginated Reading Mode Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the scrollable reading mode with a paginated book-like view where the frontend calculates page breaks using DOM measurement, with keyboard/click/swipe navigation.

**Architecture:** A `usePagination` hook creates an off-screen probe div matching the reading container's exact styles and dimensions, packs paragraphs into pages by detecting overflow, and returns `pages: string[][]`. A new `PageView` component renders one page. `ReadingModeOverlay` is refactored to use page state instead of scroll state.

**Tech Stack:** React hooks, TypeScript, Tailwind CSS, DOM API (createElement, scrollHeight)

---

### Task 1: `usePagination` hook

**Files:**
- Create: `frontend/src/hooks/usePagination.ts`

**Context:**

The hook creates a hidden probe `div` off-screen with the same styles as the reading container, then packs paragraphs into pages by detecting `scrollHeight > clientHeight` overflow after each append.

`ReadingSettings` is imported from `@/contexts/ReadingSettingsContext`. The CSS variables set by that context (`--reading-font`, etc.) are already applied globally, so the probe div can reference them.

**Step 1: Create the file**

`frontend/src/hooks/usePagination.ts`:

```typescript
import { useState, useEffect, useRef } from "react";
import type { ReadingSettings } from "@/contexts/ReadingSettingsContext";

export interface PaginationResult {
  pages: string[][];
  pageCount: number;
  isCalculating: boolean;
}

export function usePagination(
  paragraphs: string[],
  pageHeight: number,
  settings: ReadingSettings,
): PaginationResult {
  const [pages, setPages] = useState<string[][]>([]);
  const [isCalculating, setIsCalculating] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    debounceRef.current = setTimeout(() => {
      if (paragraphs.length === 0 || pageHeight <= 0) {
        setPages(paragraphs.length > 0 ? [paragraphs] : []);
        setIsCalculating(false);
        return;
      }

      setIsCalculating(true);

      // Off-screen probe div — same styles as reading container
      const probe = document.createElement("div");
      const probeWidth = Math.min(settings.maxWidth, window.innerWidth - 48);
      probe.style.cssText = [
        "position:absolute",
        "top:-9999px",
        "left:0",
        "visibility:hidden",
        "overflow:hidden",
        "box-sizing:border-box",
        `width:${probeWidth}px`,
        `height:${pageHeight}px`,
        "padding:2rem 1.5rem",
        `font-family:var(--reading-font,Georgia,serif)`,
        `font-size:${settings.fontSize}px`,
        `line-height:${settings.lineHeight}`,
        `word-spacing:${settings.wordSpacing / 10}em`,
        `letter-spacing:${settings.letterSpacing / 10}em`,
      ].join(";");
      document.body.appendChild(probe);

      const result: string[][] = [];
      let currentPage: string[] = [];

      const clearProbe = () => {
        while (probe.firstChild) probe.removeChild(probe.firstChild);
      };

      const appendPara = (text: string) => {
        const p = document.createElement("p");
        p.style.marginBottom = "1.2em";
        p.textContent = text;
        probe.appendChild(p);
      };

      for (const para of paragraphs) {
        appendPara(para);

        if (probe.scrollHeight <= probe.clientHeight) {
          // Fits on current page
          currentPage.push(para);
        } else {
          // Overflow — remove this paragraph
          probe.removeChild(probe.lastChild!);

          if (currentPage.length > 0) {
            // Save current page, start fresh
            result.push([...currentPage]);
            currentPage = [];
            clearProbe();
          }

          // Try this paragraph alone on a fresh page
          appendPara(para);
          if (probe.scrollHeight > probe.clientHeight) {
            // Still overflows even alone — force onto its own page
            result.push([para]);
            currentPage = [];
            clearProbe();
          } else {
            currentPage = [para];
          }
        }
      }

      if (currentPage.length > 0) {
        result.push(currentPage);
      }

      document.body.removeChild(probe);
      setPages(result.length > 0 ? result : [paragraphs]);
      setIsCalculating(false);
    }, 200);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [
    paragraphs,
    pageHeight,
    settings.fontSize,
    settings.lineHeight,
    settings.fontFamily,
    settings.maxWidth,
    settings.wordSpacing,
    settings.letterSpacing,
  ]);

  return { pages, pageCount: pages.length, isCalculating };
}
```

**Step 2: Verify TypeScript compiles**

```bash
cd frontend && npx tsc --noEmit 2>&1 | grep usePagination
```

Expected: no output (no errors).

**Step 3: Commit**

```bash
git add frontend/src/hooks/usePagination.ts
git commit -m "feat: usePagination hook with probe-div page calculation"
```

---

### Task 2: `PageView` component

**Files:**
- Create: `frontend/src/components/ReadingMode/PageView.tsx`

**Context:**

Renders one page's paragraphs with the same styles as the current reading overlay. The `settings` CSS variables are already globally applied by `ReadingSettingsContext`, so we use the same `style` object as the current overlay's content div.

`focusLine` is intentionally not applied in paginated mode (only meaningful for scrolling).

**Step 1: Create the file**

`frontend/src/components/ReadingMode/PageView.tsx`:

```typescript
interface Props {
  paragraphs: string[];
  pageHeight: number;
  maxWidth: number;
}

export default function PageView({ paragraphs, pageHeight, maxWidth }: Props) {
  return (
    <div
      style={{
        height: `${pageHeight}px`,
        overflow: "hidden",
      }}
      className="w-full"
    >
      <div
        style={{
          maxWidth: `${maxWidth}px`,
          fontFamily: "var(--reading-font, Georgia, serif)",
          fontSize: "var(--reading-size, 18px)",
          lineHeight: "var(--reading-line-height, 1.7)",
          wordSpacing: "var(--reading-word-spacing, 0em)",
          letterSpacing: "var(--reading-letter-spacing, 0em)",
        }}
        className="mx-auto px-6 py-8"
      >
        {paragraphs.map((para, i) => (
          <p key={i} className="mb-[1.2em]">
            {para}
          </p>
        ))}
      </div>
    </div>
  );
}
```

**Step 2: Verify TypeScript compiles**

```bash
cd frontend && npx tsc --noEmit 2>&1 | grep PageView
```

Expected: no output.

**Step 3: Commit**

```bash
git add frontend/src/components/ReadingMode/PageView.tsx
git commit -m "feat: PageView component for paginated reading"
```

---

### Task 3: Refactor `ReadingModeOverlay` — replace scroll with pages

**Files:**
- Modify: `frontend/src/components/ReadingMode/ReadingModeOverlay.tsx`

**Context:**

This is the largest change. We replace the scroll div with:
1. `usePagination` for page calculation
2. `PageView` for rendering the current page
3. Click zones (left/right halves) for navigation
4. Keyboard shortcuts (`←`, `→`, `PageUp`, `PageDown`)
5. Touch swipe (50px threshold, < 75px vertical drift)
6. Page indicator `X / Y` above MiniPlayer
7. `pageHeight` computed from `window.innerHeight - headerRef.offsetHeight - miniPlayerHeight`
8. `ResizeObserver` to recompute `pageHeight` on window resize

**Removed:**
- `scrollRef` and all scroll listeners
- `IntersectionObserver` paragraph tracking
- Header auto-hide on scroll
- `activeParagraphIndex` state (replaced by page-based tracking)
- `focusLine` application (toggle in TypographyPanel stays but has no visual effect in this mode)

**Progress saving changes:**
- `scroll_position`: `pageIndex / Math.max(1, pageCount - 1)` (normalized 0–1)
- `paragraph_index`: index of the first paragraph on the current page in the full `paragraphs` array

**Step 1: Rewrite `ReadingModeOverlay.tsx`**

```typescript
"use client";
import { useEffect, useRef, useState, useCallback } from "react";
import { BookDetail, saveReadingState } from "@/lib/api";
import { useReadingSettings } from "@/contexts/ReadingSettingsContext";
import { usePlayer } from "@/lib/player-context";
import { usePagination } from "@/hooks/usePagination";
import MiniPlayer from "./MiniPlayer";
import ChapterSidebar from "./ChapterSidebar";
import TypographyPanel from "./TypographyPanel";
import PageView from "./PageView";

interface Props {
  book: BookDetail;
  currentChapterId: number;
  onClose: () => void;
  onChapterSelect: (id: number) => void;
  chapterText: string | null;
  chapterTextLoading: boolean;
}

const MINI_PLAYER_HEIGHT = 80;

export default function ReadingModeOverlay({
  book,
  currentChapterId,
  onClose,
  onChapterSelect,
  chapterText,
  chapterTextLoading,
}: Props) {
  const { settings, updateSetting, resetSettings, cycleTheme } = useReadingSettings();
  const player = usePlayer();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [pageIndex, setPageIndex] = useState(0);
  const [pageHeight, setPageHeight] = useState(0);
  const [saveToast, setSaveToast] = useState(false);
  const [showNav, setShowNav] = useState<"left" | "right" | null>(null);

  const headerRef = useRef<HTMLElement>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pageIndexRef = useRef(0);
  const currentChapterIdRef = useRef(currentChapterId);
  const touchStartX = useRef(0);
  const touchStartY = useRef(0);

  // Keep refs in sync
  useEffect(() => { pageIndexRef.current = pageIndex; }, [pageIndex]);
  useEffect(() => { currentChapterIdRef.current = currentChapterId; }, [currentChapterId]);

  const currentChapter = book.chapters.find((c) => c.id === currentChapterId);
  const chapterIndex = book.chapters.findIndex((c) => c.id === currentChapterId);

  // Parse paragraphs from text
  const paragraphs = chapterText
    ? chapterText.split(/\n\n+/).filter((p) => p.trim().length > 0)
    : [];

  // Compute page height from header + mini player
  const computePageHeight = useCallback(() => {
    const headerH = headerRef.current?.offsetHeight ?? 52;
    setPageHeight(window.innerHeight - headerH - MINI_PLAYER_HEIGHT);
  }, []);

  useEffect(() => {
    computePageHeight();
    const observer = new ResizeObserver(computePageHeight);
    observer.observe(document.documentElement);
    return () => observer.disconnect();
  }, [computePageHeight]);

  // Recalculate page height when header renders
  useEffect(() => {
    if (headerRef.current) computePageHeight();
  }, [computePageHeight]);

  // Pagination
  const { pages, pageCount, isCalculating } = usePagination(paragraphs, pageHeight, settings);

  // Reset to page 0 when chapter changes
  useEffect(() => {
    setPageIndex(0);
  }, [currentChapterId]);

  // Navigate to previous page or chapter
  const navigatePrev = useCallback(() => {
    if (pageIndex > 0) {
      setPageIndex((i) => i - 1);
    } else if (chapterIndex > 0) {
      onChapterSelect(book.chapters[chapterIndex - 1].id);
    }
  }, [pageIndex, chapterIndex, book.chapters, onChapterSelect]);

  // Navigate to next page or chapter
  const navigateNext = useCallback(() => {
    if (pageIndex < pageCount - 1) {
      setPageIndex((i) => i + 1);
    } else if (chapterIndex < book.chapters.length - 1) {
      onChapterSelect(book.chapters[chapterIndex + 1].id);
    }
  }, [pageIndex, pageCount, chapterIndex, book.chapters, onChapterSelect]);

  // Save reading state
  const doSave = useCallback(() => {
    const currentIdx = pageIndexRef.current;
    const currentPages = pages;
    const chapterIdx = book.chapters.findIndex((c) => c.id === currentChapterIdRef.current);

    // Find the paragraph_index of the first paragraph on the current page
    let parasBefore = 0;
    for (let p = 0; p < currentIdx && p < currentPages.length; p++) {
      parasBefore += currentPages[p].length;
    }

    const scrollPos = pageCount > 1 ? currentIdx / (pageCount - 1) : 0;
    const progress = book.chapters.length > 0
      ? (chapterIdx + scrollPos) / book.chapters.length
      : 0;

    saveReadingState(book.id, {
      current_chapter_id: currentChapterIdRef.current,
      scroll_position: scrollPos,
      paragraph_index: parasBefore,
      reading_progress: Math.min(1, Math.max(0, progress)),
      audio_position: player.currentTime,
      voice_id: null,
    }).then(() => {
      setSaveToast(true);
      setTimeout(() => setSaveToast(false), 2000);
    }).catch(() => {});
  }, [book, pages, pageCount, player]);

  // Auto-save on page change (debounced 3s)
  useEffect(() => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(doSave, 3000);
    return () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current); };
  }, [pageIndex, doSave]);

  // Save on unmount
  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      doSave();
    };
  }, [doSave]);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;

      if (e.key === "Escape") { onClose(); return; }
      if (e.key === "T" || e.key === "t") { cycleTheme(); return; }
      if (e.key === "+" || e.key === "=") {
        updateSetting("fontSize", Math.min(32, settings.fontSize + 1)); return;
      }
      if (e.key === "-") {
        updateSetting("fontSize", Math.max(12, settings.fontSize - 1)); return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "0") {
        e.preventDefault(); resetSettings(); return;
      }
      if ((e.ctrlKey || e.metaKey) && (e.key === "+" || e.key === "=")) {
        e.preventDefault(); updateSetting("fontSize", Math.min(32, settings.fontSize + 2)); return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "-") {
        e.preventDefault(); updateSetting("fontSize", Math.max(12, settings.fontSize - 2)); return;
      }
      if (e.key === "ArrowRight" || e.key === "PageDown") {
        e.preventDefault(); navigateNext(); return;
      }
      if (e.key === "ArrowLeft" || e.key === "PageUp") {
        e.preventDefault(); navigatePrev(); return;
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [settings.fontSize, onClose, updateSetting, resetSettings, cycleTheme, navigateNext, navigatePrev]);

  // Touch swipe handlers
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
  }, []);

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    const dy = e.changedTouches[0].clientY - touchStartY.current;
    if (Math.abs(dx) > 50 && Math.abs(dy) < 75) {
      if (dx < 0) navigateNext();
      else navigatePrev();
    }
  }, [navigateNext, navigatePrev]);

  const currentPage = pages[pageIndex] ?? [];

  return (
    <div
      className="fixed inset-0 z-40 flex flex-col select-none"
      style={{
        backgroundColor: "var(--reading-bg, #1A1A2E)",
        color: "var(--reading-text, #E8E8E8)",
      }}
      role="dialog"
      aria-modal="true"
      aria-label="Olvasási mód"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {/* Header */}
      <header
        ref={headerRef}
        className="flex items-center justify-between px-4 py-3 border-b shrink-0"
        style={{ borderColor: "color-mix(in srgb, var(--reading-text) 15%, transparent)" }}
      >
        <button
          onClick={() => setSidebarOpen(true)}
          className="p-1.5 rounded hover:bg-white/10 transition"
          aria-label="Fejezetek"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>

        <span className="text-sm font-medium truncate mx-4 opacity-80">
          {currentChapter ? `${currentChapter.chapter_number}. ${currentChapter.title}` : book.title}
        </span>

        <button
          onClick={onClose}
          className="p-1.5 rounded hover:bg-white/10 transition"
          aria-label="Olvasási mód bezárása"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </header>

      {/* Page area */}
      <div className="flex-1 relative overflow-hidden">
        {/* Left navigation zone */}
        <button
          className="absolute left-0 top-0 h-full w-1/2 z-10 cursor-pointer opacity-0"
          onClick={navigatePrev}
          onMouseEnter={() => setShowNav("left")}
          onMouseLeave={() => setShowNav(null)}
          aria-label="Előző oldal"
          tabIndex={-1}
        />
        {/* Right navigation zone */}
        <button
          className="absolute right-0 top-0 h-full w-1/2 z-10 cursor-pointer opacity-0"
          onClick={navigateNext}
          onMouseEnter={() => setShowNav("right")}
          onMouseLeave={() => setShowNav(null)}
          aria-label="Következő oldal"
          tabIndex={-1}
        />

        {/* Hover navigation arrows */}
        <div
          className={`absolute left-3 top-1/2 -translate-y-1/2 z-20 pointer-events-none transition-opacity duration-150 ${
            showNav === "left" && pageIndex > 0 ? "opacity-40" : "opacity-0"
          }`}
        >
          <svg className="w-8 h-8" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </div>
        <div
          className={`absolute right-3 top-1/2 -translate-y-1/2 z-20 pointer-events-none transition-opacity duration-150 ${
            showNav === "right" && pageIndex < pageCount - 1 ? "opacity-40" : "opacity-0"
          }`}
        >
          <svg className="w-8 h-8" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
        </div>

        {/* Page content */}
        {chapterTextLoading || isCalculating ? (
          <div className="flex items-center justify-center h-full">
            <p className="opacity-40 text-sm">
              {chapterTextLoading ? "Betöltés..." : "Számolás..."}
            </p>
          </div>
        ) : paragraphs.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <p className="opacity-40 text-sm">Nincs szöveg.</p>
          </div>
        ) : (
          pageHeight > 0 && (
            <PageView
              paragraphs={currentPage}
              pageHeight={pageHeight}
              maxWidth={settings.maxWidth}
            />
          )
        )}
      </div>

      {/* Page indicator + save toast */}
      <div
        className="shrink-0 flex items-center justify-center gap-3 py-2"
        style={{ height: "32px" }}
      >
        {saveToast ? (
          <span className="text-xs opacity-50">✓ Elmentve</span>
        ) : pageCount > 0 ? (
          <span className="text-xs opacity-40 tabular-nums">
            {pageIndex + 1} / {pageCount}
          </span>
        ) : null}
      </div>

      {/* Typography Panel */}
      <TypographyPanel />

      {/* Chapter Sidebar */}
      <ChapterSidebar
        chapters={book.chapters}
        currentChapterId={currentChapterId}
        onSelect={onChapterSelect}
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />

      {/* Mini Player */}
      <MiniPlayer />
    </div>
  );
}
```

**Step 2: TypeScript check**

```bash
cd frontend && npx tsc --noEmit 2>&1 | grep -E "error|ReadingModeOverlay"
```

Expected: no errors.

**Step 3: Smoke test in browser**

1. `make dev` (or `make up` + local backend running)
2. Open a book → click 📖 reading mode
3. Verify: text appears as a single page, not scrollable
4. Press `→` — next page loads
5. Press `←` — previous page loads
6. Click right half — next page; click left half — previous page
7. On mobile (DevTools device mode): swipe left → next page, swipe right → prev page
8. Open Typography Panel, change font size — verify pages recount after ~200ms
9. Reach last page — verify pressing `→` loads next chapter
10. Press `Esc` — overlay closes

**Step 4: Commit**

```bash
git add frontend/src/components/ReadingMode/ReadingModeOverlay.tsx
git commit -m "feat: paginated reading mode with keyboard, click, and swipe navigation"
```

---

### Task 4: Remove `focusLine` keyboard shortcut + clean up TypographyPanel

**Files:**
- Modify: `frontend/src/components/ReadingMode/ReadingModeOverlay.tsx` (already done above — `L` key removed)
- Optional: remove the focusLine toggle from `TypographyPanel.tsx` if desired

**Note:** The `L` key shortcut for `focusLine` was removed from the overlay keyboard handler in Task 3 (it's not in the new handler). The TypographyPanel toggle can stay — it saves to settings but has no visual effect in paginated mode. If the user wants to remove the toggle:

**Step 1: Remove focusLine toggle from TypographyPanel (optional)**

In `frontend/src/components/ReadingMode/TypographyPanel.tsx`, delete lines 224–241 (the `<div>` with "Fókusz mód (L)").

**Step 2: Commit if changed**

```bash
git add frontend/src/components/ReadingMode/TypographyPanel.tsx
git commit -m "chore: remove focusLine toggle from TypographyPanel (not used in paginated mode)"
```
