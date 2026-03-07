import Link from "next/link";
import { BookWithStats } from "@/lib/api";

function formatDuration(seconds: number): string {
  if (!seconds || seconds <= 0) return "";
  const hours = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

/** Generate a deterministic gradient from a string */
function titleGradient(title: string): string {
  let hash = 0;
  for (let i = 0; i < title.length; i++) {
    hash = title.charCodeAt(i) + ((hash << 5) - hash);
  }
  const h1 = Math.abs(hash % 360);
  const h2 = (h1 + 40) % 360;
  return `linear-gradient(135deg, hsl(${h1}, 60%, 30%), hsl(${h2}, 50%, 20%))`;
}

export default function BookCard({ book }: { book: BookWithStats }) {
  const progress =
    book.chapters_total > 0
      ? Math.round((book.chapters_done / book.chapters_total) * 100)
      : 0;

  const duration = formatDuration(book.total_duration_seconds);

  return (
    <Link
      href={`/books/${book.id}`}
      className="block bg-gray-900 rounded-xl overflow-hidden hover:bg-gray-800/80 hover:ring-1 hover:ring-gray-700 transition group"
    >
      {/* Cover placeholder */}
      <div
        className="h-28 flex items-center justify-center text-4xl"
        style={{ background: titleGradient(book.title) }}
      >
        📕
      </div>

      <div className="p-4 space-y-2.5">
        {/* Title + author */}
        <div>
          <h3 className="font-semibold truncate group-hover:text-white transition-colors">
            {book.title}
          </h3>
          <p className="text-gray-400 text-sm truncate">{book.author}</p>
        </div>

        {/* Progress bar */}
        {book.chapters_total > 0 && (
          <div>
            <div className="flex justify-between text-xs text-gray-500 mb-1">
              <span>
                {book.chapters_done}/{book.chapters_total} chapters
              </span>
              <span>{progress}%</span>
            </div>
            <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${
                  book.has_active_jobs
                    ? "bg-blue-500 animate-pulse"
                    : progress === 100
                      ? "bg-green-500"
                      : "bg-green-600"
                }`}
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        )}

        {/* Meta row */}
        <div className="flex items-center gap-2 text-xs text-gray-500">
          {book.voice_name && (
            <span className="flex items-center gap-1">
              🎙️ {book.voice_name}
            </span>
          )}
          {book.voice_language && (
            <span className="px-1.5 py-0.5 bg-gray-800 rounded text-gray-400">
              {book.voice_language}
            </span>
          )}
          {duration && (
            <span className="ml-auto">⏱️ {duration}</span>
          )}
          {book.has_active_jobs && (
            <span className="text-blue-400 ml-auto animate-pulse">
              Converting...
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}
