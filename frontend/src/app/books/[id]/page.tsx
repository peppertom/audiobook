"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { getBook, generateBook, BookDetail } from "@/lib/api";
import VoiceSelector from "@/components/VoiceSelector";

export default function BookDetailPage() {
  const { id } = useParams();
  const [book, setBook] = useState<BookDetail | null>(null);
  const [selectedVoice, setSelectedVoice] = useState<number | null>(null);
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    if (id) getBook(Number(id)).then(setBook).catch(() => {});
  }, [id]);

  const handleGenerate = async () => {
    if (!book || !selectedVoice) return;
    setGenerating(true);
    try {
      await generateBook(book.id, selectedVoice);
      alert("Generation started! Check the Queue page for progress.");
    } catch {
      alert("Failed to start generation");
    } finally {
      setGenerating(false);
    }
  };

  if (!book) return <p className="text-gray-400">Loading...</p>;

  return (
    <div>
      <h1 className="text-2xl font-bold">{book.title}</h1>
      <p className="text-gray-400 mt-1">{book.author}</p>

      <div className="mt-6">
        <h2 className="text-lg font-semibold mb-3">Select a voice</h2>
        <VoiceSelector selected={selectedVoice} onSelect={setSelectedVoice} />
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
        </h2>
        <ul className="space-y-2">
          {book.chapters.map((ch) => (
            <li
              key={ch.id}
              className="flex justify-between items-center bg-gray-900 rounded-lg px-4 py-3"
            >
              <span>
                {ch.chapter_number}. {ch.title}
              </span>
              <span className="text-gray-500 text-sm">
                {ch.word_count} words
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
