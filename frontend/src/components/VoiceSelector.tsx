"use client";
import { useEffect, useState } from "react";
import { getVoices, Voice } from "@/lib/api";

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

  return (
    <div className="flex flex-wrap gap-2">
      {voices.map((v) => (
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
      {voices.length === 0 && (
        <p className="text-gray-500 text-sm">
          No voices yet. Create one in the Voices page.
        </p>
      )}
    </div>
  );
}
