"use client";

import { useEffect, useState, useMemo } from "react";
import { getBooks, getJobs, Book, Job, BookWithStats } from "@/lib/api";
import BookCard from "@/components/BookCard";
import FileUpload from "@/components/FileUpload";
import { Search } from "lucide-react";

type SortOption = "recent" | "title" | "author";

function enrichBooks(books: Book[], jobs: Job[]): BookWithStats[] {
  return books.map((book) => {
    const bookJobs = jobs.filter(
      (j) => j.book_title === book.title || false,
    );
    // We need to match by chapter — jobs have chapter_id but books have chapter_count
    // For now, use the jobs list: count done jobs per book
    const doneJobs = bookJobs.filter((j) => j.status === "done" && j.audio_output_path);
    const activeJobs = bookJobs.filter(
      (j) => j.status === "processing" || j.status === "queued",
    );

    const totalDuration = doneJobs.reduce(
      (sum, j) => sum + (j.duration_seconds ?? 0),
      0,
    );

    // Get voice info from first job
    const firstJob = doneJobs[0] || bookJobs[0];

    return {
      ...book,
      chapters_done: doneJobs.length,
      chapters_total: book.chapter_count,
      total_duration_seconds: totalDuration,
      has_active_jobs: activeJobs.length > 0,
      voice_name: firstJob?.voice_name ?? undefined,
      voice_language: undefined, // would need voice data
    };
  });
}

export default function LibraryPage() {
  const [books, setBooks] = useState<Book[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortOption>("recent");

  useEffect(() => {
    getBooks().then(setBooks).catch(() => {});
    getJobs().then(setJobs).catch(() => {});
  }, []);



  const enriched = useMemo(() => enrichBooks(books, jobs), [books, jobs]);

  const filtered = useMemo(() => {
    let result = enriched;

    // Search filter
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (b) =>
          b.title.toLowerCase().includes(q) ||
          b.author.toLowerCase().includes(q),
      );
    }

    // Sort
    result = [...result].sort((a, b) => {
      switch (sort) {
        case "title":
          return a.title.localeCompare(b.title);
        case "author":
          return a.author.localeCompare(b.author);
        case "recent":
        default:
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      }
    });

    return result;
  }, [enriched, search, sort]);

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Library</h1>

      <FileUpload
        onUpload={(book) => setBooks((prev) => [book, ...prev])}
      />

      {/* Search + Sort */}
      {books.length > 0 && (
        <div className="flex items-center gap-3 mt-6">
          <div className="flex-1 relative">
            <Search
              size={16}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500"
            />
            <input
              type="text"
              placeholder="Search by title or author..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-gray-900 border border-gray-800 rounded-lg pl-9 pr-4 py-2 text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:border-gray-600 transition-colors"
            />
          </div>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortOption)}
            className="bg-gray-900 border border-gray-800 rounded-lg px-3 py-2 text-sm text-gray-300 focus:outline-none focus:border-gray-600"
          >
            <option value="recent">Recently added</option>
            <option value="title">Title A-Z</option>
            <option value="author">Author A-Z</option>
          </select>
        </div>
      )}

      {/* Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mt-6">
        {filtered.map((book) => (
          <BookCard key={book.id} book={book} />
        ))}
      </div>

      {books.length === 0 && (
        <div className="text-center py-16">
          <p className="text-4xl mb-4">📚</p>
          <p className="text-gray-400 text-lg mb-2">No books yet</p>
          <p className="text-gray-500 text-sm">
            Upload an EPUB file above to get started.
          </p>
        </div>
      )}

      {books.length > 0 && filtered.length === 0 && search && (
        <p className="text-gray-500 text-center mt-8">
          No books matching "{search}"
        </p>
      )}
    </div>
  );
}
