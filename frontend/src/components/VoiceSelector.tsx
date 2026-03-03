"use client";
import { useEffect, useState } from "react";
import { getVoices, Voice } from "@/lib/api";
import Link from "next/link";

export default function VoiceSelector({
  selected,
  onSelect,
}: {
  selected: number | null;
  onSelect: (id: number) => void;
}) {
  const [voices, setVoices] = useState<Voice[]>([]);

  useEffect(() => {
    getVoices().then(setVoices).catch(() => {});
  }, []);

  // Only show voices that have a reference clip (ready for TTS)
  const readyVoices = voices.filter((v) => v.reference_clip_path);

  return (
    <div className="flex flex-wrap gap-2">
      {readyVoices.map((v) => (
        <button
          key={v.id}
          onClick={() => onSelect(v.id)}
          className={`px-4 py-2 rounded-full text-sm transition ${
            selected === v.id
              ? "bg-blue-600 text-white"
              : "bg-gray-800 text-gray-300 hover:bg-gray-700"
          }`}
        >
          {v.name}
        </button>
      ))}
      {readyVoices.length === 0 && (
        <p className="text-gray-500 text-sm">
          No voices with reference clips.{" "}
          <Link href="/voices" className="text-blue-400 hover:underline">
            Add one in Voices page
          </Link>
          .
        </p>
      )}
    </div>
  );
}
