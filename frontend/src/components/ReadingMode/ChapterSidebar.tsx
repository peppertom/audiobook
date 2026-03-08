"use client";
import { useEffect, useRef } from "react";
import { Chapter } from "@/lib/api";

interface ChapterWithProgress extends Chapter {
  readingProgress?: number; // 0-1
}

interface Props {
  chapters: ChapterWithProgress[];
  currentChapterId: number;
  onSelect: (id: number) => void;
  open: boolean;
  onClose: () => void;
}

function estimateReadingMinutes(wordCount: number): number {
  return Math.max(1, Math.ceil(wordCount / 200));
}

export default function ChapterSidebar({ chapters, currentChapterId, onSelect, open, onClose }: Props) {
  const currentRef = useRef<HTMLButtonElement>(null);

  // Scroll current chapter into view when sidebar opens
  useEffect(() => {
    if (open && currentRef.current) {
      currentRef.current.scrollIntoView({ block: "center", behavior: "smooth" });
    }
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  const totalWords = chapters.reduce((s, c) => s + c.word_count, 0);
  const overallProgress =
    chapters.length > 0
      ? chapters.reduce((s, c) => s + (c.readingProgress ?? 0), 0) / chapters.length
      : 0;

  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 z-40 bg-black/50 transition-opacity duration-300 ${open ? "opacity-100" : "opacity-0 pointer-events-none"}`}
        onClick={onClose}
      />

      {/* Panel */}
      <div
        className={`fixed top-0 left-0 bottom-0 z-50 w-72 bg-gray-950 border-r border-gray-800 flex flex-col transition-transform duration-300 ${open ? "translate-x-0" : "-translate-x-full"}`}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800 shrink-0">
          <span className="font-semibold text-sm">📚 Fejezetek</span>
          <button onClick={onClose} className="text-gray-500 hover:text-white transition text-lg leading-none">
            ✕
          </button>
        </div>

        {/* Chapter list */}
        <div className="flex-1 overflow-y-auto py-2">
          {chapters.map((ch) => {
            const isCurrent = ch.id === currentChapterId;
            const pct = ch.readingProgress != null ? Math.round(ch.readingProgress * 100) : null;
            const isDone = pct != null && pct >= 99;
            const mins = estimateReadingMinutes(ch.word_count);

            return (
              <button
                key={ch.id}
                ref={isCurrent ? currentRef : undefined}
                onClick={() => { onSelect(ch.id); onClose(); }}
                className={`w-full text-left px-4 py-2.5 flex items-start gap-2.5 transition-colors ${
                  isCurrent
                    ? "bg-blue-900/30 text-white"
                    : "text-gray-400 hover:bg-gray-900 hover:text-gray-200"
                }`}
              >
                {/* Icon */}
                <span className="shrink-0 text-xs mt-0.5 w-4 text-center">
                  {isDone ? "✓" : isCurrent ? "►" : ""}
                </span>

                {/* Text */}
                <div className="flex-1 min-w-0">
                  <div className="text-sm truncate">
                    {ch.chapter_number}. {ch.title}
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-xs text-gray-600">~{mins} perc</span>
                    {pct != null && (
                      <span className={`text-xs ${isDone ? "text-green-500" : isCurrent ? "text-blue-400" : "text-gray-600"}`}>
                        {pct}%
                      </span>
                    )}
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        {/* Footer stats */}
        <div className="px-4 py-3 border-t border-gray-800 shrink-0 text-xs text-gray-500 space-y-0.5">
          <div>
            📊 Összesített: {Math.round(overallProgress * 100)}%
          </div>
          <div>
            ⏱ ~{estimateReadingMinutes(totalWords)} perc összesen
          </div>
        </div>
      </div>
    </>
  );
}
