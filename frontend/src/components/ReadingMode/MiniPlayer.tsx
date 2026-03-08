"use client";
import { usePlayer } from "@/lib/player-context";

const SPEEDS = [1, 1.25, 1.5, 2, 0.75];

function formatTime(seconds: number): string {
  if (!isFinite(seconds) || seconds < 0) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export default function MiniPlayer() {
  const player = usePlayer();
  const { track, isPlaying, currentTime, duration, playbackRate } = player;

  if (!track) return null;

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    player.seek(ratio * duration);
  };

  const cycleSpeed = () => {
    const idx = SPEEDS.indexOf(playbackRate);
    player.setSpeed(SPEEDS[(idx + 1) % SPEEDS.length]);
  };

  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-50 bg-gray-950/95 backdrop-blur-md border-t border-gray-800"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      {/* Seek bar */}
      <div
        className="w-full h-1 bg-gray-800 cursor-pointer group"
        onClick={handleSeek}
      >
        <div
          className="h-full bg-blue-500 relative transition-[width] duration-100"
          style={{ width: `${progress}%` }}
        >
          <div className="absolute right-0 top-1/2 -translate-y-1/2 w-3 h-3 bg-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity shadow" />
        </div>
      </div>

      {/* Controls row */}
      <div className="flex items-center gap-3 px-4 py-2">
        {/* Prev chapter */}
        <button
          onClick={() => player.skipChapter(-1)}
          className="text-gray-400 hover:text-white transition shrink-0"
          title="Előző fejezet"
        >
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
            <path d="M6 6h2v12H6zm3.5 6 8.5 6V6z" />
          </svg>
        </button>

        {/* Play / Pause */}
        <button
          onClick={player.togglePlay}
          className="w-9 h-9 flex items-center justify-center rounded-full bg-blue-600 hover:bg-blue-500 transition shrink-0"
          title={isPlaying ? "Szünet" : "Lejátszás"}
        >
          {isPlaying ? (
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
              <rect x="6" y="4" width="4" height="16" rx="1" />
              <rect x="14" y="4" width="4" height="16" rx="1" />
            </svg>
          ) : (
            <svg className="w-4 h-4 ml-0.5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M8 5v14l11-7z" />
            </svg>
          )}
        </button>

        {/* Next chapter */}
        <button
          onClick={() => player.skipChapter(1)}
          className="text-gray-400 hover:text-white transition shrink-0"
          title="Következő fejezet"
        >
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
            <path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z" />
          </svg>
        </button>

        {/* Time */}
        <span className="text-xs text-gray-400 tabular-nums shrink-0">
          {formatTime(currentTime)} / {formatTime(duration)}
        </span>

        {/* Chapter title */}
        <span className="flex-1 text-xs text-gray-400 truncate min-w-0">
          {track.chapterNumber}. {track.chapterTitle}
        </span>

        {/* Speed */}
        <button
          onClick={cycleSpeed}
          className="text-xs text-gray-400 hover:text-white transition shrink-0 w-10 text-right tabular-nums"
          title="Lejátszási sebesség"
        >
          {playbackRate}x
        </button>
      </div>
    </div>
  );
}
