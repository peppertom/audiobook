"use client";
import { useEffect, useState, useRef, useCallback } from "react";
import { useParams } from "next/navigation";
import {
  getBook, generateBook, getBookJobs, getChapterText, getVoices,
  BookDetail, Job, Voice, TimingChunk,
} from "@/lib/api";
import VoiceSelector from "@/components/VoiceSelector";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

function formatTime(seconds: number): string {
  if (!isFinite(seconds) || seconds < 0) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

// ─── Audio player with synced text highlighting ─────────────────────────────

function ChapterPlayer({
  job,
  bookId,
  chapterId,
  isTextOpen,
}: {
  job: Job;
  bookId: number;
  chapterId: number;
  isTextOpen: boolean;
}) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  // Text + timing
  const [text, setText] = useState<string | null>(null);
  const [textLoading, setTextLoading] = useState(false);
  const [textLoaded, setTextLoaded] = useState(false);
  const [timing, setTiming] = useState<TimingChunk[]>([]);
  const activeChunkRef = useRef<HTMLSpanElement>(null);
  const textContainerRef = useRef<HTMLDivElement>(null);

  const audioUrl = `${API_BASE}/${job.audio_output_path}`;

  // Parse timing data from job
  useEffect(() => {
    if (job.timing_data) {
      try {
        setTiming(JSON.parse(job.timing_data));
      } catch {
        setTiming([]);
      }
    }
  }, [job.timing_data]);

  // Load text when panel opens
  useEffect(() => {
    if (isTextOpen && !textLoaded && !textLoading) {
      setTextLoading(true);
      getChapterText(bookId, chapterId)
        .then((data) => { setText(data.text_content); setTextLoaded(true); })
        .catch(() => { setText("Failed to load text."); setTextLoaded(true); })
        .finally(() => setTextLoading(false));
    }
  }, [isTextOpen, textLoaded, textLoading, bookId, chapterId]);

  // Find active chunk index
  const activeChunkIndex = timing.length > 0
    ? timing.findIndex((c) => currentTime >= c.start && currentTime < c.end)
    : -1;

  // Auto-scroll to active chunk
  useEffect(() => {
    if (activeChunkRef.current && textContainerRef.current && playing) {
      const container = textContainerRef.current;
      const el = activeChunkRef.current;
      const containerRect = container.getBoundingClientRect();
      const elRect = el.getBoundingClientRect();
      // Scroll if element is outside visible area
      if (elRect.top < containerRect.top || elRect.bottom > containerRect.bottom) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }
  }, [activeChunkIndex, playing]);

  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (playing) {
      audio.pause();
    } else {
      audio.play();
    }
  };

  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    const audio = audioRef.current;
    if (!audio || !duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    audio.currentTime = ratio * duration;
  };

  // Click on a chunk to seek to it
  const seekToChunk = useCallback((chunkIndex: number) => {
    const audio = audioRef.current;
    if (!audio || !timing[chunkIndex]) return;
    audio.currentTime = timing[chunkIndex].start;
    if (!playing) audio.play();
  }, [timing, playing]);

  // Render text with chunk highlighting
  const renderHighlightedText = () => {
    if (!text) return null;

    // If no timing data, show plain text
    if (timing.length === 0) {
      return <p className="text-sm text-gray-300 whitespace-pre-wrap leading-relaxed">{text}</p>;
    }

    // Render each chunk as a clickable span
    return (
      <div className="text-sm leading-relaxed">
        {timing.map((chunk, i) => {
          const isActive = i === activeChunkIndex;
          const isPast = activeChunkIndex >= 0 && i < activeChunkIndex;
          return (
            <span
              key={i}
              ref={isActive ? activeChunkRef : undefined}
              onClick={() => seekToChunk(i)}
              className={`cursor-pointer transition-colors duration-300 ${
                isActive
                  ? "bg-blue-500/30 text-white rounded px-0.5 -mx-0.5"
                  : isPast
                    ? "text-gray-500"
                    : "text-gray-300"
              } hover:bg-blue-500/15`}
            >
              {chunk.text}
              {i < timing.length - 1 && " "}
            </span>
          );
        })}
      </div>
    );
  };

  return (
    <>
      {/* Audio controls */}
      <div className="flex items-center gap-3 mt-2">
        <button
          onClick={togglePlay}
          className="w-8 h-8 flex items-center justify-center rounded-full bg-green-600 hover:bg-green-500 transition shrink-0"
          title={playing ? "Pause" : "Play"}
        >
          {playing ? (
            <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
              <rect x="6" y="4" width="4" height="16" rx="1" />
              <rect x="14" y="4" width="4" height="16" rx="1" />
            </svg>
          ) : (
            <svg className="w-3.5 h-3.5 ml-0.5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M8 5v14l11-7z" />
            </svg>
          )}
        </button>
        <span className="text-xs text-gray-500 tabular-nums w-10 text-right shrink-0">
          {formatTime(currentTime)}
        </span>
        <div
          className="flex-1 h-1.5 bg-gray-800 rounded-full cursor-pointer group relative"
          onClick={handleSeek}
        >
          <div
            className="h-full bg-green-500 rounded-full relative transition-[width] duration-100"
            style={{ width: duration ? `${(currentTime / duration) * 100}%` : "0%" }}
          >
            <div className="absolute right-0 top-1/2 -translate-y-1/2 w-3 h-3 bg-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity shadow" />
          </div>
        </div>
        <span className="text-xs text-gray-500 tabular-nums w-10 shrink-0">
          {formatTime(duration)}
        </span>
        <audio
          ref={audioRef}
          src={audioUrl}
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onEnded={() => { setPlaying(false); setCurrentTime(0); }}
          onTimeUpdate={() => setCurrentTime(audioRef.current?.currentTime ?? 0)}
          onLoadedMetadata={() => setDuration(audioRef.current?.duration ?? 0)}
          preload="metadata"
        />
      </div>

      {/* Text panel with highlight sync */}
      {isTextOpen && (
        <div
          ref={textContainerRef}
          className="mt-3 bg-gray-800/50 rounded-lg px-4 py-3 max-h-80 overflow-y-auto scroll-smooth"
        >
          {textLoading && <p className="text-gray-500 text-sm">Loading...</p>}
          {textLoaded && renderHighlightedText()}
        </div>
      )}
    </>
  );
}

// ─── Plain text view (no audio) ─────────────────────────────────────────────

function ChapterTextView({ bookId, chapterId }: { bookId: number; chapterId: number }) {
  const [text, setText] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getChapterText(bookId, chapterId)
      .then((data) => setText(data.text_content))
      .catch(() => setText("Failed to load text."))
      .finally(() => setLoading(false));
  }, [bookId, chapterId]);

  if (loading) return <p className="text-gray-500 text-sm mt-2">Loading...</p>;

  return (
    <div className="mt-3 bg-gray-800/50 rounded-lg px-4 py-3 max-h-80 overflow-y-auto">
      <p className="text-sm text-gray-300 whitespace-pre-wrap leading-relaxed">{text}</p>
    </div>
  );
}

// ─── Main page ──────────────────────────────────────────────────────────────

export default function BookDetailPage() {
  const { id } = useParams();
  const [book, setBook] = useState<BookDetail | null>(null);
  const [selectedVoice, setSelectedVoice] = useState<number | null>(null);
  const [generating, setGenerating] = useState(false);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [expandedChapters, setExpandedChapters] = useState<Set<number>>(new Set());
  const [voices, setVoices] = useState<Voice[]>([]);
  const [chapterVoices, setChapterVoices] = useState<Record<number, number>>({});

  useEffect(() => {
    if (id) {
      getBook(Number(id)).then(setBook).catch(() => {});
      getBookJobs(Number(id)).then(setJobs).catch(() => {});
    }
    getVoices().then(setVoices).catch(() => {});
  }, [id]);

  // Poll for job updates while any jobs are not done
  useEffect(() => {
    if (!id) return;
    const hasActive = jobs.some((j) => j.status === "processing" || j.status === "queued");
    if (!hasActive && jobs.length > 0) return;
    const interval = setInterval(() => {
      getBookJobs(Number(id)).then(setJobs).catch(() => {});
    }, 3000);
    return () => clearInterval(interval);
  }, [id, jobs]);

  const readyVoices = voices.filter((v) => v.reference_clip_path);

  const getChapterVoice = (chapterId: number): number | null => {
    return chapterVoices[chapterId] ?? selectedVoice;
  };

  const setChapterVoice = (chapterId: number, voiceId: number) => {
    setChapterVoices((prev) => ({ ...prev, [chapterId]: voiceId }));
  };

  const handleGenerate = async () => {
    if (!book || !selectedVoice) return;
    setGenerating(true);
    try {
      const overrides: Record<number, number> = {};
      for (const [chId, vId] of Object.entries(chapterVoices)) {
        if (vId !== selectedVoice) {
          overrides[Number(chId)] = vId;
        }
      }
      await generateBook(book.id, selectedVoice, overrides);
      getBookJobs(book.id).then(setJobs).catch(() => {});
      alert("Generation started! Check the Queue page for progress.");
    } catch {
      alert("Failed to start generation");
    } finally {
      setGenerating(false);
    }
  };

  const toggleChapterText = (chapterId: number) => {
    setExpandedChapters((prev) => {
      const next = new Set(prev);
      if (next.has(chapterId)) {
        next.delete(chapterId);
      } else {
        next.add(chapterId);
      }
      return next;
    });
  };

  if (!book) return <p className="text-gray-400">Loading...</p>;

  const doneJobsByChapter = new Map<number, Job>();
  for (const job of jobs) {
    if (job.status === "done" && job.audio_output_path) {
      doneJobsByChapter.set(job.chapter_id, job);
    }
  }

  const doneCount = doneJobsByChapter.size;
  const hasMultipleVoices = readyVoices.length > 1;

  return (
    <div>
      <h1 className="text-2xl font-bold">{book.title}</h1>
      <p className="text-gray-400 mt-1">{book.author}</p>

      <div className="mt-6">
        <h2 className="text-lg font-semibold mb-3">
          {hasMultipleVoices ? "Default voice" : "Select a voice"}
        </h2>
        <VoiceSelector selected={selectedVoice} onSelect={setSelectedVoice} />
        {hasMultipleVoices && selectedVoice && (
          <p className="text-xs text-gray-500 mt-2">
            You can override the voice per chapter below.
          </p>
        )}
      </div>

      <button
        onClick={handleGenerate}
        disabled={!selectedVoice || generating}
        className="mt-4 px-6 py-2 bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
      >
        {generating ? "Starting..." : "Generate Audiobook"}
      </button>

      <div className="mt-8">
        <h2 className="text-lg font-semibold mb-3">
          Chapters ({book.chapters.length})
          {doneCount > 0 && (
            <span className="text-sm font-normal text-green-400 ml-2">
              {doneCount} ready
            </span>
          )}
        </h2>
        <ul className="space-y-2">
          {book.chapters.map((ch) => {
            const doneJob = doneJobsByChapter.get(ch.id);
            const isExpanded = expandedChapters.has(ch.id);
            const currentVoice = getChapterVoice(ch.id);
            return (
              <li
                key={ch.id}
                className="bg-gray-900 rounded-lg px-4 py-3"
              >
                <div className="flex justify-between items-center gap-2">
                  <button
                    onClick={() => toggleChapterText(ch.id)}
                    className="text-left flex items-center gap-2 hover:text-blue-400 transition min-w-0"
                  >
                    <svg
                      className={`w-3 h-3 text-gray-500 transition-transform shrink-0 ${isExpanded ? "rotate-90" : ""}`}
                      fill="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path d="M8 5v14l11-7z" />
                    </svg>
                    <span className="truncate">
                      {ch.chapter_number}. {ch.title}
                    </span>
                  </button>
                  <div className="flex items-center gap-2 shrink-0">
                    {hasMultipleVoices && selectedVoice && (
                      <select
                        value={currentVoice ?? ""}
                        onChange={(e) => setChapterVoice(ch.id, Number(e.target.value))}
                        className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-gray-300 focus:outline-none focus:border-blue-500"
                      >
                        {readyVoices.map((v) => (
                          <option key={v.id} value={v.id}>
                            {v.name}{v.id === selectedVoice ? " (default)" : ""}
                          </option>
                        ))}
                      </select>
                    )}
                    <span className="text-gray-500 text-sm">
                      {ch.word_count} w
                      {doneJob && (
                        <span className="text-green-400 ml-1">&#10003;</span>
                      )}
                    </span>
                  </div>
                </div>
                {/* If done: combined player + synced text. Otherwise: plain text view */}
                {doneJob ? (
                  <ChapterPlayer
                    job={doneJob}
                    bookId={book.id}
                    chapterId={ch.id}
                    isTextOpen={isExpanded}
                  />
                ) : (
                  isExpanded && <ChapterTextView bookId={book.id} chapterId={ch.id} />
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
