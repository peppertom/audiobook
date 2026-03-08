"use client";
import { useEffect, useState, useRef, useCallback } from "react";
import { useParams } from "next/navigation";
import {
  getBook, generateBook, getBookJobs, getChapterText, getVoices, generateChapterSummary,
  BookDetail, Job, Voice, TimingChunk,
} from "@/lib/api";
import { usePlayer } from "@/lib/player-context";
import VoiceSelector from "@/components/VoiceSelector";
import ReadingModeOverlay from "@/components/ReadingMode/ReadingModeOverlay";
import ResumePrompt from "@/components/ResumePrompt";
import { getReadingState, ReadingState } from "@/lib/api";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "";

function formatTime(seconds: number): string {
  if (!isFinite(seconds) || seconds < 0) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

// ─── Simple chapter play/pause button with synced text highlighting ─────────

function ChapterPlayButton({
  job,
  bookId,
  chapterId,
  bookTitle,
  chapterTitle,
  chapterNumber,
  chapters,
}: {
  job: Job;
  bookId: number;
  chapterId: number;
  bookTitle: string;
  chapterTitle: string;
  chapterNumber: number;
  chapters: Array<{ id: number; number: number; title: string; audioUrl: string | null }>;
}) {
  const player = usePlayer();
  const audioUrl = `${API_BASE}/${job.audio_output_path}`;

  const isActiveChapter = player.track?.chapterId === chapterId;
  const isPlaying = isActiveChapter && player.isPlaying;

  const togglePlay = () => {
    if (isActiveChapter) {
      player.togglePlay();
    } else {
      player.play({
        bookId,
        chapterId,
        audioUrl,
        bookTitle,
        chapterTitle,
        chapterNumber,
        voiceName: job.voice_name,
        chapters,
      });
    }
  };

  return (
    <button
      onClick={togglePlay}
      className={`w-8 h-8 flex items-center justify-center rounded-full transition shrink-0 ${
        isActiveChapter
          ? "bg-blue-600 hover:bg-blue-500 text-white"
          : "bg-green-600 hover:bg-green-500 text-white"
      }`}
      title={isPlaying ? "Pause" : "Play"}
    >
      {isPlaying ? (
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
  );
}

function ChapterTextPanel({
  bookId,
  chapterId,
  job,
  isOpen,
}: {
  bookId: number;
  chapterId: number;
  job: Job;
  isOpen: boolean;
}) {
  const player = usePlayer();
  const [text, setText] = useState<string | null>(null);
  const [textLoading, setTextLoading] = useState(false);
  const [textLoaded, setTextLoaded] = useState(false);
  const [timing, setTiming] = useState<TimingChunk[]>([]);
  const activeChunkRef = useRef<HTMLSpanElement>(null);
  const textContainerRef = useRef<HTMLDivElement>(null);

  const isActiveChapter = player.track?.chapterId === chapterId;
  const currentTime = isActiveChapter ? player.currentTime : 0;
  const isPlaying = isActiveChapter && player.isPlaying;

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
    if (isOpen && !textLoaded && !textLoading) {
      setTextLoading(true);
      getChapterText(bookId, chapterId)
        .then((data) => { setText(data.text_content); setTextLoaded(true); })
        .catch(() => { setText("Failed to load text."); setTextLoaded(true); })
        .finally(() => setTextLoading(false));
    }
  }, [isOpen, textLoaded, textLoading, bookId, chapterId]);

  // Find active chunk index
  const activeChunkIndex = timing.length > 0
    ? timing.findIndex((c) => currentTime >= c.start && currentTime < c.end)
    : -1;

  // Auto-scroll to active chunk
  useEffect(() => {
    if (activeChunkRef.current && textContainerRef.current && isPlaying) {
      const container = textContainerRef.current;
      const el = activeChunkRef.current;
      const containerRect = container.getBoundingClientRect();
      const elRect = el.getBoundingClientRect();
      if (elRect.top < containerRect.top || elRect.bottom > containerRect.bottom) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }
  }, [activeChunkIndex, isPlaying]);

  // Click on a chunk to seek to it
  const seekToChunk = useCallback((chunkIndex: number) => {
    if (!timing[chunkIndex]) return;
    if (!isActiveChapter) {
      // Cannot seek if not playing this chapter - player controls are in the bottom bar
      return;
    }
    player.seek(timing[chunkIndex].start);
  }, [timing, isActiveChapter, player]);

  // Render text with chunk highlighting
  const renderHighlightedText = () => {
    if (!text) return null;

    if (timing.length === 0) {
      return <p className="text-sm text-gray-300 whitespace-pre-wrap leading-relaxed">{text}</p>;
    }

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

  if (!isOpen) return null;

  return (
    <div
      ref={textContainerRef}
      className="mt-3 bg-gray-800/50 rounded-lg px-4 py-3 max-h-80 overflow-y-auto scroll-smooth"
    >
      {textLoading && <p className="text-gray-500 text-sm">Loading...</p>}
      {textLoaded && renderHighlightedText()}
    </div>
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
  const [expandedSummaries, setExpandedSummaries] = useState<Set<number>>(new Set());
  const [summaryLoadingChapters, setSummaryLoadingChapters] = useState<Set<number>>(new Set());
  const [voices, setVoices] = useState<Voice[]>([]);
  const [chapterVoices, setChapterVoices] = useState<Record<number, number>>({});
  const [readingMode, setReadingMode] = useState(false);
  const [readingChapterId, setReadingChapterId] = useState<number | null>(null);
  const [readingChapterText, setReadingChapterText] = useState<string | null>(null);
  const [readingChapterTextLoading, setReadingChapterTextLoading] = useState(false);
  const [resumeState, setResumeState] = useState<ReadingState | null>(null);

  useEffect(() => {
    if (id) {
      getBook(Number(id)).then(setBook).catch(() => {});
      getBookJobs(Number(id)).then(setJobs).catch(() => {});
      getReadingState(Number(id))
        .then((state) => { if (state.reading_progress > 0) setResumeState(state); })
        .catch(() => {});
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

  // Load chapter text for reading mode
  const openReadingMode = useCallback(async (chapterId: number) => {
    setReadingChapterId(chapterId);
    setReadingMode(true);
    setReadingChapterText(null);
    setReadingChapterTextLoading(true);
    try {
      const data = await getChapterText(Number(id), chapterId);
      setReadingChapterText(data.text_content);
    } catch {
      setReadingChapterText("Nem sikerült betölteni a szöveget.");
    } finally {
      setReadingChapterTextLoading(false);
    }
  }, [id]);

  const handleReadingChapterSelect = useCallback((chapterId: number) => {
    setReadingChapterId(chapterId);
    openReadingMode(chapterId);
  }, [openReadingMode]);

  // F key toggles reading mode (opens first chapter if none active)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (e.key === "f" || e.key === "F") {
        if (readingMode) {
          setReadingMode(false);
        } else if (book) {
          const first = book.chapters[0];
          if (first) openReadingMode(readingChapterId ?? first.id);
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [readingMode, book, readingChapterId, openReadingMode]);

  const handleRetitle = async () => {
    if (!book) return;
    try {
      const res = await fetch(`${API_BASE}/api/books/${book.id}/retitle-chapters`, { method: "POST" });
      const data = await res.json();
      if (data.updated > 0) {
        await getBook(book.id).then(setBook);
      }
      alert(`Updated ${data.updated} of ${data.total} chapter titles.`);
    } catch {
      alert("Failed to retitle chapters.");
    }
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

  const toggleSummary = (chapterId: number) => {
    setExpandedSummaries((prev) => {
      const next = new Set(prev);
      if (next.has(chapterId)) { next.delete(chapterId); } else { next.add(chapterId); }
      return next;
    });
  };

  const handleGenerateChapterSummary = async (chapterId: number) => {
    if (!book) return;
    setSummaryLoadingChapters((prev) => new Set(prev).add(chapterId));
    try {
      const { summary } = await generateChapterSummary(book.id, chapterId);
      setBook((prev) => prev ? {
        ...prev,
        chapters: prev.chapters.map((ch) =>
          ch.id === chapterId ? { ...ch, summary } : ch
        ),
      } : prev);
      setExpandedSummaries((prev) => new Set(prev).add(chapterId));
    } catch {
      alert("Összefoglaló generálása sikertelen. Fut az Ollama?");
    } finally {
      setSummaryLoadingChapters((prev) => { const next = new Set(prev); next.delete(chapterId); return next; });
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

  // Build chapters list for player context
  const chaptersForPlayer = book.chapters.map((ch) => {
    const doneJob = doneJobsByChapter.get(ch.id);
    return {
      id: ch.id,
      number: ch.chapter_number,
      title: ch.title,
      audioUrl: doneJob ? `${API_BASE}/${doneJob.audio_output_path}` : null,
    };
  });

  const doneCount = doneJobsByChapter.size;
  const hasMultipleVoices = readyVoices.length > 1;

  return (
    <div>
      {/* Resume Prompt */}
      {resumeState && !readingMode && (
        <ResumePrompt
          state={resumeState}
          book={book}
          onResume={() => {
            setResumeState(null);
            openReadingMode(resumeState.current_chapter_id);
          }}
          onStartOver={() => {
            setResumeState(null);
            openReadingMode(book.chapters[0]?.id ?? book.chapters[0].id);
          }}
        />
      )}

      {/* Reading Mode Overlay */}
      {readingMode && readingChapterId && (
        <ReadingModeOverlay
          book={book}
          currentChapterId={readingChapterId}
          onClose={() => setReadingMode(false)}
          onChapterSelect={handleReadingChapterSelect}
          chapterText={readingChapterText}
          chapterTextLoading={readingChapterTextLoading}
        />
      )}

      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">{book.title}</h1>
          <p className="text-gray-400 mt-1">{book.author}</p>
        </div>
        <button
          onClick={() => {
            const first = book.chapters[0];
            if (first) openReadingMode(readingChapterId ?? first.id);
          }}
          className="shrink-0 mt-1 flex items-center gap-2 px-3 py-1.5 bg-gray-800 hover:bg-gray-700 rounded-lg text-sm transition"
          title="Olvasási mód (F)"
        >
          <span>📖</span>
          <span>Olvasási mód</span>
        </button>
      </div>

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
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold">
            Chapters ({book.chapters.length})
            {doneCount > 0 && (
              <span className="text-sm font-normal text-green-400 ml-2">
                {doneCount} ready
              </span>
            )}
          </h2>
          <button
            onClick={handleRetitle}
            className="text-xs text-gray-500 hover:text-gray-300 transition"
            title="Re-extract chapter titles from text"
          >
            Re-extract titles
          </button>
        </div>
        <ul className="space-y-2">
          {[...book.chapters]
            .sort((a, b) => {
              const aDone = doneJobsByChapter.has(a.id) ? 0 : 1;
              const bDone = doneJobsByChapter.has(b.id) ? 0 : 1;
              if (aDone !== bDone) return aDone - bDone;
              return a.chapter_number - b.chapter_number;
            })
            .map((ch) => {
            const doneJob = doneJobsByChapter.get(ch.id);
            const isExpanded = expandedChapters.has(ch.id);
            const currentVoice = getChapterVoice(ch.id);
            return (
              <li
                key={ch.id}
                className={`bg-gray-900 rounded-lg px-4 py-3 transition-colors ${
                  doneJob ? "border-l-2 border-green-600" : ""
                }`}
              >
                <div className="flex justify-between items-center gap-3">
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    {doneJob ? (
                      <ChapterPlayButton
                        job={doneJob}
                        bookId={book.id}
                        chapterId={ch.id}
                        bookTitle={book.title}
                        chapterTitle={ch.title}
                        chapterNumber={ch.chapter_number}
                        chapters={chaptersForPlayer}
                      />
                    ) : (
                      <div className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-800 text-gray-500 shrink-0">
                        <svg className="w-3.5 h-3.5 ml-0.5" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M8 5v14l11-7z" />
                        </svg>
                      </div>
                    )}
                    <button
                      onClick={() => openReadingMode(ch.id)}
                      className="shrink-0 text-gray-600 hover:text-gray-300 transition text-sm"
                      title="Olvasási mód"
                    >
                      📖
                    </button>
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
                  </div>
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
                    <div className="text-right shrink-0">
                      {doneJob ? (
                        <div className="text-gray-300 text-sm">{formatTime(doneJob.duration_seconds ?? 0)}</div>
                      ) : null}
                      <div className="text-gray-500 text-xs">
                        ~{Math.max(1, Math.ceil(ch.word_count / 200))} perc
                      </div>
                      {resumeState?.current_chapter_id === ch.id && (
                        <div className="text-blue-400 text-xs tabular-nums">
                          {Math.round(resumeState.reading_progress * 100)}%
                        </div>
                      )}
                    </div>
                  </div>
                </div>
                {/* Summary toggle */}
                {ch.summary ? (
                  <div className="mt-2">
                    <button
                      onClick={() => toggleSummary(ch.id)}
                      className="text-xs text-blue-400 hover:text-blue-300 transition flex items-center gap-1"
                    >
                      <svg
                        className={`w-3 h-3 transition-transform ${expandedSummaries.has(ch.id) ? "rotate-90" : ""}`}
                        fill="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path d="M8 5v14l11-7z" />
                      </svg>
                      Összefoglaló
                    </button>
                    {expandedSummaries.has(ch.id) && (
                      <p className="mt-1.5 text-sm text-gray-400 leading-relaxed pl-4 border-l border-gray-700">
                        {ch.summary}
                      </p>
                    )}
                  </div>
                ) : (
                  <button
                    onClick={() => handleGenerateChapterSummary(ch.id)}
                    disabled={summaryLoadingChapters.has(ch.id)}
                    className="mt-2 text-xs text-gray-500 hover:text-gray-300 transition disabled:opacity-50"
                  >
                    {summaryLoadingChapters.has(ch.id) ? "Generálás..." : "Összefoglaló generálása"}
                  </button>
                )}

                {/* Text panel with sync highlighting for done chapters, plain text for others */}
                {doneJob ? (
                  <ChapterTextPanel
                    bookId={book.id}
                    chapterId={ch.id}
                    job={doneJob}
                    isOpen={isExpanded}
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
