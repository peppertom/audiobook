"use client";
import { useRef, useState } from "react";

interface PlayerProps {
  src: string | null;
  title: string;
  chapter: string;
  onEnded?: () => void;
  onTimeUpdate?: (time: number) => void;
}

export default function Player({
  src,
  title,
  chapter,
  onEnded,
  onTimeUpdate,
}: PlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  const toggle = () => {
    if (!audioRef.current || !src) return;
    if (playing) audioRef.current.pause();
    else audioRef.current.play();
    setPlaying(!playing);
  };

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, "0")}`;
  };

  if (!src) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-gray-900 border-t border-gray-800 px-6 py-3">
      <audio
        ref={audioRef}
        src={src}
        onTimeUpdate={(e) => {
          setCurrentTime(e.currentTarget.currentTime);
          onTimeUpdate?.(e.currentTarget.currentTime);
        }}
        onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
        onEnded={() => {
          setPlaying(false);
          onEnded?.();
        }}
      />
      <div className="max-w-6xl mx-auto flex items-center gap-4">
        <button
          onClick={toggle}
          className="text-white text-2xl w-10 h-10 flex items-center justify-center"
        >
          {playing ? "⏸" : "▶"}
        </button>
        <div className="flex-1">
          <div className="flex justify-between text-sm mb-1">
            <span className="text-white font-medium truncate">
              {title} — {chapter}
            </span>
            <span className="text-gray-500">
              {formatTime(currentTime)} / {formatTime(duration)}
            </span>
          </div>
          <input
            type="range"
            min={0}
            max={duration || 0}
            value={currentTime}
            onChange={(e) => {
              if (audioRef.current)
                audioRef.current.currentTime = Number(e.target.value);
            }}
            className="w-full h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer"
          />
        </div>
      </div>
    </div>
  );
}
