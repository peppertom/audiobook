"use client";
import { useEffect, useRef, useState, useCallback } from "react";
import { BookDetail, saveReadingState } from "@/lib/api";
import { useReadingSettings } from "@/contexts/ReadingSettingsContext";
import { usePlayer } from "@/lib/player-context";
import MiniPlayer from "./MiniPlayer";
import ChapterSidebar from "./ChapterSidebar";
import TypographyPanel from "./TypographyPanel";

interface Props {
  book: BookDetail;
  currentChapterId: number;
  onClose: () => void;
  onChapterSelect: (id: number) => void;
  chapterText: string | null;
  chapterTextLoading: boolean;
}

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
  const [headerVisible, setHeaderVisible] = useState(true);
  const [activeParagraphIndex, setActiveParagraphIndex] = useState(0);
  const [saveToast, setSaveToast] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const lastScrollY = useRef(0);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeParagraphRef = useRef(0);
  const currentChapterIdRef = useRef(currentChapterId);

  // Keep refs in sync
  useEffect(() => { activeParagraphRef.current = activeParagraphIndex; }, [activeParagraphIndex]);
  useEffect(() => { currentChapterIdRef.current = currentChapterId; }, [currentChapterId]);

  const currentChapter = book.chapters.find((c) => c.id === currentChapterId);

  // Parse paragraphs from text
  const paragraphs = chapterText
    ? chapterText.split(/\n\n+/).filter((p) => p.trim().length > 0)
    : [];

  // Header auto-hide on scroll
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    let timeout: ReturnType<typeof setTimeout>;
    const handler = () => {
      const delta = el.scrollTop - lastScrollY.current;
      lastScrollY.current = el.scrollTop;
      if (delta > 5) {
        setHeaderVisible(false);
      } else if (delta < -5) {
        setHeaderVisible(true);
      }
      clearTimeout(timeout);
      timeout = setTimeout(() => setHeaderVisible(true), 2000);
    };
    el.addEventListener("scroll", handler, { passive: true });
    return () => { el.removeEventListener("scroll", handler); clearTimeout(timeout); };
  }, []);

  // IntersectionObserver for active paragraph tracking
  useEffect(() => {
    if (observerRef.current) observerRef.current.disconnect();
    const container = scrollRef.current;
    if (!container || paragraphs.length === 0) return;

    observerRef.current = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => {
            const aRect = a.boundingClientRect;
            const bRect = b.boundingClientRect;
            return Math.abs(aRect.top - window.innerHeight / 2) - Math.abs(bRect.top - window.innerHeight / 2);
          });
        if (visible[0]) {
          const idx = Number((visible[0].target as HTMLElement).dataset.paraIndex);
          if (!isNaN(idx)) setActiveParagraphIndex(idx);
        }
      },
      { root: container, threshold: 0.3 }
    );

    const paras = container.querySelectorAll("[data-para-index]");
    paras.forEach((el) => observerRef.current!.observe(el));
    return () => observerRef.current?.disconnect();
  }, [paragraphs.length, currentChapterId]);

  // Save reading state
  const doSave = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const scrollPos = el.scrollHeight > 0 ? el.scrollTop / el.scrollHeight : 0;
    const chapterIdx = book.chapters.findIndex((c) => c.id === currentChapterIdRef.current);
    const progress = book.chapters.length > 0
      ? (chapterIdx + scrollPos) / book.chapters.length
      : 0;
    saveReadingState(book.id, {
      current_chapter_id: currentChapterIdRef.current,
      scroll_position: scrollPos,
      paragraph_index: activeParagraphRef.current,
      reading_progress: Math.min(1, Math.max(0, progress)),
      audio_position: player.currentTime,
      voice_id: null,
    }).then(() => {
      setSaveToast(true);
      setTimeout(() => setSaveToast(false), 2000);
    }).catch(() => {});
  }, [book, player]);

  // Debounced auto-save on scroll
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const handler = () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(doSave, 5000);
    };
    el.addEventListener("scroll", handler, { passive: true });
    return () => el.removeEventListener("scroll", handler);
  }, [doSave]);

  // Save on unmount (beforeunload equivalent for SPA)
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
      if (e.key === "L" || e.key === "l") { updateSetting("focusLine", !settings.focusLine); return; }
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
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [settings.fontSize, settings.focusLine, onClose, updateSetting, resetSettings, cycleTheme]);

  const miniPlayerHeight = 80; // px — text area bottom padding

  return (
    <div
      className="fixed inset-0 z-40 flex flex-col"
      style={{
        backgroundColor: "var(--reading-bg, #1A1A2E)",
        color: "var(--reading-text, #E8E8E8)",
      }}
      data-reading-overlay
      role="dialog"
      aria-modal="true"
      aria-label="Olvasási mód"
    >
      {/* Header */}
      <header
        className={`flex items-center justify-between px-4 py-3 border-b shrink-0 transition-transform duration-300 ${
          headerVisible ? "translate-y-0" : "-translate-y-full"
        }`}
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

      {/* Save toast */}
      {saveToast && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-50 px-3 py-1.5 rounded-full bg-gray-800/90 text-xs text-gray-300 pointer-events-none">
          ✓ Elmentve
        </div>
      )}

      {/* Scrollable text area */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto scroll-smooth"
        style={{ paddingBottom: `${miniPlayerHeight + 24}px` }}
      >
        <div
          style={{
            maxWidth: "var(--reading-max-width, 680px)",
            fontFamily: "var(--reading-font, Georgia, serif)",
            fontSize: "var(--reading-size, 18px)",
            lineHeight: "var(--reading-line-height, 1.7)",
            wordSpacing: "var(--reading-word-spacing, 0em)",
            letterSpacing: "var(--reading-letter-spacing, 0em)",
          }}
          className="mx-auto px-6 py-8"
        >
          {chapterTextLoading && (
            <p className="opacity-40 text-center py-20">Betöltés...</p>
          )}

          {!chapterTextLoading && paragraphs.length === 0 && (
            <p className="opacity-40 text-center py-20">Nincs szöveg.</p>
          )}

          {paragraphs.map((para, i) => {
            const isActive = settings.focusLine && i === activeParagraphIndex;
            const isDimmed = settings.focusLine && i !== activeParagraphIndex;
            return (
              <p
                key={i}
                data-para-index={i}
                className={`mb-[1.2em] transition-opacity duration-300 ${
                  isDimmed ? "opacity-30" : "opacity-100"
                } ${isActive ? "font-[500]" : ""}`}
              >
                {para}
              </p>
            );
          })}
        </div>
      </div>

      {/* Typography Panel (floating) */}
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
