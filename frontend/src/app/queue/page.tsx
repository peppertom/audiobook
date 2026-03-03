"use client";
import { useEffect, useState } from "react";
import { getJobs, Job } from "@/lib/api";

const STATUS_COLORS: Record<string, string> = {
  queued: "text-yellow-400",
  processing: "text-blue-400",
  done: "text-green-400",
  failed: "text-red-400",
};

const STATUS_ICONS: Record<string, string> = {
  queued: "⏳",
  processing: "🔄",
  done: "✅",
  failed: "❌",
};

export default function QueuePage() {
  const [jobs, setJobs] = useState<Job[]>([]);

  useEffect(() => {
    const load = () => getJobs().then(setJobs).catch(() => {});
    load();
    const interval = setInterval(load, 3000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Queue</h1>
      <div className="space-y-2">
        {jobs.map((job) => (
          <div
            key={job.id}
            className="flex justify-between items-center bg-gray-900 rounded-lg px-5 py-3"
          >
            <div className="flex items-center gap-3 min-w-0">
              <span className="text-lg shrink-0">
                {STATUS_ICONS[job.status] || "⏳"}
              </span>
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">
                  {job.book_title || `Book`}
                  <span className="text-gray-500 ml-1">
                    — Ch.{job.chapter_number || "?"} {job.chapter_title || ""}
                  </span>
                </p>
                <p className="text-xs text-gray-600">
                  Voice: {job.voice_name || `#${job.voice_id}`}
                  {job.error_message && (
                    <span className="text-red-400 ml-2">
                      {job.error_message}
                    </span>
                  )}
                </p>
              </div>
            </div>
            <span
              className={`text-sm font-medium shrink-0 ml-3 ${STATUS_COLORS[job.status] || "text-gray-400"}`}
            >
              {job.status}
            </span>
          </div>
        ))}
      </div>
      {jobs.length === 0 && (
        <p className="text-gray-500 text-center mt-8">No jobs in queue.</p>
      )}
    </div>
  );
}
