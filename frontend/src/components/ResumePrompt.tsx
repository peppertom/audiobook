"use client";
import { ReadingState, BookDetail } from "@/lib/api";

interface Props {
  state: ReadingState;
  book: BookDetail;
  onResume: () => void;
  onStartOver: () => void;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("hu-HU", { month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

export default function ResumePrompt({ state, book, onResume, onStartOver }: Props) {
  const chapter = book.chapters.find((c) => c.id === state.current_chapter_id);
  const pct = Math.round(state.reading_progress * 100);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 max-w-sm w-full mx-4 shadow-2xl">
        <div className="text-2xl mb-3">📍</div>
        <h2 className="font-semibold text-base mb-1">Folytassa ott, ahol abbahagyta?</h2>
        {chapter && (
          <p className="text-sm text-gray-400 mb-1">
            {chapter.chapter_number}. fejezet — {pct > 0 ? `${pct}%-nál` : "az elején"}
          </p>
        )}
        <p className="text-xs text-gray-600 mb-5">
          {formatDate(state.updated_at)}
        </p>
        <div className="flex gap-3">
          <button
            onClick={onResume}
            className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-500 rounded-xl text-sm font-medium transition"
          >
            Folytatás
          </button>
          <button
            onClick={onStartOver}
            className="flex-1 py-2.5 bg-gray-800 hover:bg-gray-700 rounded-xl text-sm text-gray-300 transition"
          >
            Az elejéről
          </button>
        </div>
      </div>
    </div>
  );
}
