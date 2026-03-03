"use client";
import { useEffect, useState } from "react";
import { getJobs, Job } from "@/lib/api";

const STATUS_COLORS: Record<string, string> = {
  queued: "text-yellow-400",
  processing: "text-blue-400",
  done: "text-green-400",
  failed: "text-red-400",
};

export default function QueuePage() {
  const [jobs, setJobs] = useState<Job[]>([]);

  useEffect(() => {
    const load = () => getJobs().then(setJobs).catch(() => {});
    load();
    const interval = setInterval(load, 3000); // Poll every 3s
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
            <div>
              <span className="text-sm text-gray-400">Job #{job.id}</span>
              <span className="text-sm text-gray-600 ml-3">
                Chapter {job.chapter_id}
              </span>
            </div>
            <span
              className={`text-sm font-medium ${STATUS_COLORS[job.status] || "text-gray-400"}`}
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
