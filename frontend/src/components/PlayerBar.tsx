"use client";

import { usePlayer } from "@/lib/player-context";
import { SkipBack, SkipForward, Play, Pause, Volume2 } from "lucide-react";

function formatTime(seconds: number): string {
  if (!isFinite(seconds) || seconds < 0) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

const SPEED_OPTIONS = [0.5, 0.75, 1, 1.25, 1.5, 2];

export function PlayerBar() {
  const {
    track, isPlaying, currentTime, duration, playbackRate, volume,
    togglePlay, seek, setSpeed, setVol, skipChapter,
  } = usePlayer();

  if (!track) return null;

  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    seek(ratio * duration);
  };

  const progress = duration ? (currentTime / duration) * 100 : 0;

  return (
    <div className="h-20 bg-gray-900 border-t border-gray-800 px-4 flex items-center gap-4 shrink-0">
      {/* Controls */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => skipChapter(-1)}
          className="p-1.5 text-gray-400 hover:text-white transition-colors"
          title="Previous chapter"
        >
          <SkipBack size={16} />
        </button>
        <button
          onClick={togglePlay}
          className="w-9 h-9 flex items-center justify-center rounded-full bg-white text-gray-900 hover:bg-gray-200 transition-colors"
        >
          {isPlaying ? <Pause size={16} /> : <Play size={16} className="ml-0.5" />}
        </button>
        <button
          onClick={() => skipChapter(1)}
          className="p-1.5 text-gray-400 hover:text-white transition-colors"
          title="Next chapter"
        >
          <SkipForward size={16} />
        </button>
      </div>

      {/* Track info + progress */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between mb-1">
          <p className="text-sm truncate">
            <span className="text-gray-400">Ch.{track.chapterNumber}</span>
            <span className="mx-1.5 text-gray-600">—</span>
            <span className="text-white">{track.bookTitle}</span>
          </p>
          <span className="text-xs text-gray-500 tabular-nums shrink-0 ml-3">
            {formatTime(currentTime)} / {formatTime(duration)}
          </span>
        </div>
        <div
          className="h-1.5 bg-gray-800 rounded-full cursor-pointer group"
          onClick={handleSeek}
        >
          <div
            className="h-full bg-blue-500 rounded-full relative transition-[width] duration-100"
            style={{ width: `${progress}%` }}
          >
            <div className="absolute right-0 top-1/2 -translate-y-1/2 w-3 h-3 bg-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity shadow" />
          </div>
        </div>
      </div>

      {/* Speed control */}
      <select
        value={playbackRate}
        onChange={(e) => setSpeed(Number(e.target.value))}
        className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-gray-300 focus:outline-none hidden sm:block"
      >
        {SPEED_OPTIONS.map((s) => (
          <option key={s} value={s}>
            {s}x
          </option>
        ))}
      </select>

      {/* Volume — desktop only */}
      <div className="hidden md:flex items-center gap-2">
        <Volume2 size={14} className="text-gray-500" />
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={volume}
          onChange={(e) => setVol(Number(e.target.value))}
          className="w-20 h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer"
        />
      </div>
    </div>
  );
}
