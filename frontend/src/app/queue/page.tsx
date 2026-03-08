"use client";
import { useEffect, useState, useRef } from "react";
import { getJobs, Job } from "@/lib/api";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "";

const STATUS_LABELS: Record<string, string> = {
  queued: "Queued",
  processing: "Generating...",
  done: "Done",
  failed: "Failed",
};

function formatTime(seconds: number): string {
  if (!isFinite(seconds) || seconds < 0) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

interface ChunkProgress {
  chunk: number;
  total_chunks: number;
  words_done: number;
  total_words: number;
  pct: number;
  elapsed_s: number;
  eta_s: number | null;
  preview: string;
}

function tryParseProgress(msg: string | null | undefined): ChunkProgress | null {
  if (!msg) return null;
  try {
    const parsed = JSON.parse(msg);
    if (typeof parsed.chunk === "number" && typeof parsed.total_chunks === "number") {
      return parsed as ChunkProgress;
    }
  } catch {
    // Not JSON — old-style string message
  }
  return null;
}

function JobRow({
  job,
  onCancel,
  onStart,
}: {
  job: Job;
  onCancel: (id: number) => void;
  onStart: (id: number) => void;
}) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  const isDone = job.status === "done";
  const isFailed = job.status === "failed";
  const isProcessing = job.status === "processing";
  const isQueued = job.status === "queued";
  const audioUrl =
    isDone && job.audio_output_path
      ? `${API_BASE}/${job.audio_output_path}`
      : null;

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

  return (
    <div className="bg-gray-900 rounded-lg px-5 py-3 space-y-2">
      <div className="flex items-center gap-3">
        {/* Play button or status icon */}
        {audioUrl ? (
          <button
            onClick={togglePlay}
            className="w-9 h-9 flex items-center justify-center rounded-full bg-green-600 hover:bg-green-500 transition shrink-0"
            title={playing ? "Pause" : "Play"}
          >
            {playing ? (
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
        ) : isProcessing ? (
          <div className="w-9 h-9 flex items-center justify-center shrink-0">
            <div className="w-5 h-5 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : isFailed ? (
          <div className="w-9 h-9 flex items-center justify-center text-red-400 text-lg shrink-0">
            &#10007;
          </div>
        ) : (
          <div className="w-9 h-9 flex items-center justify-center text-yellow-400 text-lg shrink-0">
            &#9716;
          </div>
        )}

        {/* Info */}
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium truncate">
            {job.book_title || "Book"}
            <span className="text-gray-500 ml-1">
              &mdash; Ch.{job.chapter_number ?? "?"} {job.chapter_title || ""}
            </span>
          </p>
          <p className="text-xs text-gray-500">
            Voice: {job.voice_name || `#${job.voice_id}`}
            {isProcessing && job.error_message && !tryParseProgress(job.error_message) && (
              <span className="text-blue-300 ml-2">{job.error_message}</span>
            )}
            {isFailed && job.error_message && (
              <span className="text-red-400 ml-2">{job.error_message}</span>
            )}
            {isDone && job.completed_at && (
              <span className="text-gray-600 ml-2">
                {new Date(job.completed_at).toLocaleTimeString()}
              </span>
            )}
          </p>
        </div>

        {/* Status badge */}
        <span
          className={`text-xs font-medium px-2.5 py-1 rounded-full shrink-0 ${
            isDone
              ? "bg-green-900/40 text-green-400"
              : isProcessing
                ? "bg-blue-900/40 text-blue-400"
                : isFailed
                  ? "bg-red-900/40 text-red-400"
                  : "bg-yellow-900/40 text-yellow-400"
          }`}
        >
          {STATUS_LABELS[job.status] || job.status}
        </span>

        {/* Actions for queued jobs */}
        {isQueued && (
          <div className="flex items-center gap-1 shrink-0">
            <button
              onClick={() => onStart(job.id)}
              className="px-2.5 py-1 text-xs bg-blue-600 hover:bg-blue-500 rounded transition"
              title="Start this job"
            >
              Start
            </button>
            <button
              onClick={() => onCancel(job.id)}
              className="text-gray-500 hover:text-red-400 transition text-sm px-1"
              title="Cancel job"
            >
              &#10005;
            </button>
          </div>
        )}
        {isFailed && (
          <button
            onClick={() => onCancel(job.id)}
            className="text-gray-500 hover:text-red-400 transition text-sm shrink-0"
            title="Remove failed job"
          >
            &#10005;
          </button>
        )}
      </div>

      {/* TTS generation progress */}
      {isProcessing && (() => {
        const progress = tryParseProgress(job.error_message);
        if (!progress) return null;
        return (
          <div className="space-y-1.5 pl-12">
            {/* Progress bar */}
            <div className="flex items-center gap-3">
              <div className="flex-1 h-2 bg-gray-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-blue-500 rounded-full transition-all duration-700 ease-out"
                  style={{ width: `${progress.pct}%` }}
                />
              </div>
              <span className="text-xs font-medium text-blue-400 tabular-nums w-10 text-right shrink-0">
                {progress.pct}%
              </span>
            </div>
            {/* Stats line */}
            <p className="text-xs text-gray-500 tabular-nums">
              {progress.words_done.toLocaleString()} / {progress.total_words.toLocaleString()} words
              <span className="mx-1.5 text-gray-700">&bull;</span>
              {formatTime(progress.elapsed_s)} elapsed
              {progress.eta_s !== null && (
                <>
                  <span className="mx-1.5 text-gray-700">&bull;</span>
                  <span className="text-blue-300">~{formatTime(progress.eta_s)} remaining</span>
                </>
              )}
              <span className="mx-1.5 text-gray-700">&bull;</span>
              chunk {progress.chunk}/{progress.total_chunks}
            </p>
            {/* Preview text */}
            {progress.preview && (
              <p className="text-xs text-gray-600 truncate">
                &#9659; {progress.preview}
              </p>
            )}
          </div>
        );
      })()}

      {/* Audio player with seekable progress bar */}
      {audioUrl && (
        <div className="flex items-center gap-3 pl-12">
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
      )}
    </div>
  );
}

export default function QueuePage() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [starting, setStarting] = useState(false);
  const [retrying, setRetrying] = useState(false);

  const refresh = () => getJobs().then(setJobs).catch(() => {});

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 3000);
    return () => clearInterval(interval);
  }, []);

  const doneCount = jobs.filter((j) => j.status === "done").length;
  const totalCount = jobs.length;
  const processingCount = jobs.filter(
    (j) => j.status === "processing",
  ).length;
  const queuedCount = jobs.filter((j) => j.status === "queued").length;
  const failedCount = jobs.filter((j) => j.status === "failed").length;

  const startNext = async () => {
    setStarting(true);
    try {
      await fetch(`${API_BASE}/api/jobs/start-next`, { method: "POST" });
      await refresh();
    } catch {
      alert("Failed to start job. Is the worker running?");
    } finally {
      setStarting(false);
    }
  };

  const startAll = async () => {
    setStarting(true);
    try {
      await fetch(`${API_BASE}/api/jobs/start-all`, { method: "POST" });
      await refresh();
    } catch {
      alert("Failed to start jobs. Is the worker running?");
    } finally {
      setStarting(false);
    }
  };

  const retryFailed = async () => {
    setRetrying(true);
    try {
      await fetch(`${API_BASE}/api/jobs/retry-failed`, { method: "POST" });
      await refresh();
    } catch {
      alert("Failed to retry jobs");
    } finally {
      setRetrying(false);
    }
  };

  const cancelJob = async (id: number) => {
    try {
      await fetch(`${API_BASE}/api/jobs/${id}`, { method: "DELETE" });
      setJobs((prev) => prev.filter((j) => j.id !== id));
    } catch {
      alert("Failed to cancel job");
    }
  };

  const startJob = async (id: number) => {
    try {
      const res = await fetch(`${API_BASE}/api/jobs/${id}/start`, {
        method: "POST",
      });
      if (!res.ok) {
        const err = await res.json();
        alert(err.detail || "Failed to start job");
        return;
      }
      await refresh();
    } catch {
      alert("Failed to start job. Is the worker running?");
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold">Queue</h1>
        {totalCount > 0 && (
          <p className="text-sm text-gray-400">
            {doneCount}/{totalCount} done
            {processingCount > 0 && (
              <span className="text-blue-400 ml-2">
                ({processingCount} generating)
              </span>
            )}
          </p>
        )}
      </div>

      {/* Controls */}
      {(queuedCount > 0 || failedCount > 0) && (
        <div className="flex gap-2 mb-4">
          {queuedCount > 0 && !processingCount && (
            <>
              <button
                onClick={startNext}
                disabled={starting}
                className="px-4 py-1.5 text-sm bg-blue-600 hover:bg-blue-700 rounded-lg transition disabled:opacity-50"
              >
                {starting ? "Starting..." : "Start Next"}
              </button>
              <button
                onClick={startAll}
                disabled={starting}
                className="px-4 py-1.5 text-sm bg-gray-800 hover:bg-gray-700 rounded-lg transition disabled:opacity-50"
              >
                {starting ? "Starting..." : `Start All (${queuedCount})`}
              </button>
            </>
          )}
          {failedCount > 0 && (
            <button
              onClick={retryFailed}
              disabled={retrying}
              className="px-3 py-1.5 text-sm bg-red-900/40 text-red-400 hover:bg-red-900/60 rounded-lg transition disabled:opacity-50"
            >
              {retrying ? "Retrying..." : `Retry ${failedCount} failed`}
            </button>
          )}
        </div>
      )}

      {/* Progress bar */}
      {totalCount > 0 && (
        <div className="h-1.5 bg-gray-800 rounded-full mb-4 overflow-hidden">
          <div
            className="h-full bg-green-500 rounded-full transition-all duration-500"
            style={{ width: `${(doneCount / totalCount) * 100}%` }}
          />
        </div>
      )}

      <div className="space-y-6">
        {(() => {
          const statusOrder = { processing: 0, queued: 1, done: 2, failed: 3 };
          const sorted = [...jobs].sort((a, b) => {
            const ao = statusOrder[a.status as keyof typeof statusOrder] ?? 4;
            const bo = statusOrder[b.status as keyof typeof statusOrder] ?? 4;
            if (ao !== bo) return ao - bo;
            return (a.chapter_number ?? 0) - (b.chapter_number ?? 0);
          });

          // Group by book, preserving book order by first active status
          const bookOrder: string[] = [];
          const byBook: Record<string, Job[]> = {};
          for (const job of sorted) {
            const key = String(job.book_id ?? job.book_title ?? "Unknown");
            if (!byBook[key]) { byBook[key] = []; bookOrder.push(key); }
            byBook[key].push(job);
          }

          return bookOrder.map((key) => {
            const bookJobs = byBook[key];
            const title = bookJobs[0].book_title || `Book #${bookJobs[0].book_id}`;
            return (
              <div key={key} className="space-y-2">
                <h2 className="text-sm font-semibold text-gray-400 px-1 border-b border-gray-800 pb-1">
                  {title}
                </h2>
                {bookJobs.map((job) => (
                  <JobRow key={job.id} job={job} onCancel={cancelJob} onStart={startJob} />
                ))}
              </div>
            );
          });
        })()}
      </div>

      {jobs.length === 0 && (
        <p className="text-gray-500 text-center mt-8">
          No jobs in queue. Generate audio from a book to get started.
        </p>
      )}
    </div>
  );
}
