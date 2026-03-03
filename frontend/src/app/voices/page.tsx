"use client";
import { useEffect, useState } from "react";
import { getVoices, createVoice, deleteVoice, Voice } from "@/lib/api";

export default function VoicesPage() {
  const [voices, setVoices] = useState<Voice[]>([]);
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    getVoices().then(setVoices).catch(() => {});
  }, []);

  const handleCreate = async () => {
    if (!name.trim()) return;
    setCreating(true);
    try {
      const voice = await createVoice({ name, language: "hu", source: "upload" });
      setVoices((prev) => [voice, ...prev]);
      setName("");
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (id: number) => {
    await deleteVoice(id);
    setVoices((prev) => prev.filter((v) => v.id !== id));
  };

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Voices</h1>

      <div className="flex gap-3 mb-6">
        <input
          type="text"
          placeholder="Voice name..."
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleCreate()}
          className="flex-1 bg-gray-900 border border-gray-700 rounded-lg px-4 py-2 focus:outline-none focus:border-blue-500"
        />
        <button
          onClick={handleCreate}
          disabled={!name.trim() || creating}
          className="px-6 py-2 bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition"
        >
          Create Voice
        </button>
      </div>

      <div className="space-y-3">
        {voices.map((voice) => (
          <div
            key={voice.id}
            className="flex justify-between items-center bg-gray-900 rounded-lg px-5 py-4"
          >
            <div>
              <h3 className="font-semibold">{voice.name}</h3>
              <p className="text-gray-500 text-sm">
                {voice.source} &middot;{" "}
                {voice.reference_clip_path
                  ? "Has reference clip"
                  : "No reference clip yet"}
              </p>
            </div>
            <button
              onClick={() => handleDelete(voice.id)}
              className="text-red-400 hover:text-red-300 text-sm"
            >
              Delete
            </button>
          </div>
        ))}
      </div>
      {voices.length === 0 && (
        <p className="text-gray-500 text-center mt-8">No voices yet.</p>
      )}
    </div>
  );
}
