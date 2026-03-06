"use client";

import {
  createContext, useContext, useState, useRef, useCallback, useEffect, ReactNode,
} from "react";

export interface TrackInfo {
  bookId: number;
  chapterId: number;
  audioUrl: string;
  bookTitle: string;
  chapterTitle: string;
  chapterNumber: number;
  voiceName?: string;
  /** All chapters in this book for skip next/prev */
  chapters?: Array<{ id: number; number: number; title: string; audioUrl: string | null }>;
}

interface PlayerContextType {
  /** Currently loaded track (null = nothing playing) */
  track: TrackInfo | null;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  playbackRate: number;
  volume: number;

  play: (track: TrackInfo) => void;
  pause: () => void;
  togglePlay: () => void;
  seek: (time: number) => void;
  setSpeed: (rate: number) => void;
  setVol: (vol: number) => void;
  skipChapter: (direction: 1 | -1) => void;
  stop: () => void;

  /** Ref to the single <audio> element — for advanced integrations */
  audioRef: React.RefObject<HTMLAudioElement | null>;
}

const PlayerContext = createContext<PlayerContextType | undefined>(undefined);

export function PlayerProvider({ children }: { children: ReactNode }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [track, setTrack] = useState<TrackInfo | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [volume, setVolume] = useState(1);

  const play = useCallback((newTrack: TrackInfo) => {
    const audio = audioRef.current;
    if (!audio) return;

    // If same track, just resume
    if (track?.audioUrl === newTrack.audioUrl) {
      audio.play();
      return;
    }

    // New track
    setTrack(newTrack);
    audio.src = newTrack.audioUrl;
    audio.playbackRate = playbackRate;
    audio.volume = volume;
    audio.play().catch(() => {});
  }, [track, playbackRate, volume]);

  const pause = useCallback(() => {
    audioRef.current?.pause();
  }, []);

  const togglePlay = useCallback(() => {
    const audio = audioRef.current;
    if (!audio || !track) return;
    if (isPlaying) audio.pause();
    else audio.play().catch(() => {});
  }, [isPlaying, track]);

  const seek = useCallback((time: number) => {
    const audio = audioRef.current;
    if (audio) audio.currentTime = time;
  }, []);

  const setSpeed = useCallback((rate: number) => {
    setPlaybackRate(rate);
    if (audioRef.current) audioRef.current.playbackRate = rate;
  }, []);

  const setVol = useCallback((vol: number) => {
    setVolume(vol);
    if (audioRef.current) audioRef.current.volume = vol;
  }, []);

  const skipChapter = useCallback((direction: 1 | -1) => {
    if (!track?.chapters) return;
    const currentIdx = track.chapters.findIndex((c) => c.id === track.chapterId);
    if (currentIdx === -1) return;
    const nextIdx = currentIdx + direction;
    if (nextIdx < 0 || nextIdx >= track.chapters.length) return;
    const next = track.chapters[nextIdx];
    if (!next.audioUrl) return;

    play({
      ...track,
      chapterId: next.id,
      chapterNumber: next.number,
      chapterTitle: next.title,
      audioUrl: next.audioUrl,
    });
  }, [track, play]);

  const stop = useCallback(() => {
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      audio.src = "";
    }
    setTrack(null);
    setIsPlaying(false);
    setCurrentTime(0);
    setDuration(0);
  }, []);

  return (
    <PlayerContext.Provider
      value={{
        track, isPlaying, currentTime, duration, playbackRate, volume,
        play, pause, togglePlay, seek, setSpeed, setVol, skipChapter, stop,
        audioRef,
      }}
    >
      {children}

      {/* Single global audio element */}
      <audio
        ref={audioRef}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onEnded={() => {
          setIsPlaying(false);
          // Auto-play next chapter
          skipChapter(1);
        }}
        onTimeUpdate={() => setCurrentTime(audioRef.current?.currentTime ?? 0)}
        onLoadedMetadata={() => setDuration(audioRef.current?.duration ?? 0)}
        preload="metadata"
      />
    </PlayerContext.Provider>
  );
}

export function usePlayer() {
  const ctx = useContext(PlayerContext);
  if (!ctx) throw new Error("usePlayer must be used within PlayerProvider");
  return ctx;
}
