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
