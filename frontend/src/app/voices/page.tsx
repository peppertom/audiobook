"use client";
import { useEffect, useState, useRef } from "react";
import {
  getVoices,
  createVoice,
  deleteVoice,
  uploadReferenceClip,
  createVoiceFromYoutube,
  Voice,
} from "@/lib/api";

function VoiceCard({
  voice,
  onUpdate,
  onDelete,
}: {
  voice: Voice;
  onUpdate: (v: Voice) => void;
  onDelete: (id: number) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [ytUrl, setYtUrl] = useState("");
  const [extracting, setExtracting] = useState(false);
  const [showYoutube, setShowYoutube] = useState(false);

  const handleFileUpload = async (file: File) => {
    setUploading(true);
    try {
      const updated = await uploadReferenceClip(voice.id, file);
      onUpdate(updated);
    } catch {
      alert("Failed to upload reference clip");
    } finally {
      setUploading(false);
    }
  };

  const handleYoutube = async () => {
    if (!ytUrl.trim()) return;
    setExtracting(true);
    try {
      const updated = await createVoiceFromYoutube(voice.id, ytUrl);
      onUpdate(updated);
      setYtUrl("");
      setShowYoutube(false);
    } catch {
      alert("Failed to extract voice from YouTube");
    } finally {
      setExtracting(false);
    }
  };

  const hasClip = !!voice.reference_clip_path;

  return (
    <div className="bg-gray-900 rounded-lg px-5 py-4 space-y-3">
      <div className="flex justify-between items-start">
        <div>
          <h3 className="font-semibold text-lg">{voice.name}</h3>
          <p className="text-gray-500 text-sm mt-0.5">
            {voice.source}
            {hasClip ? (
              <span className="text-green-400 ml-2">✓ Reference clip ready</span>
            ) : (
              <span className="text-yellow-400 ml-2">⚠ No reference clip</span>
            )}
          </p>
        </div>
        <button
          onClick={() => onDelete(voice.id)}
          className="text-red-400 hover:text-red-300 text-sm shrink-0"
        >
          Delete
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        {/* WAV Upload */}
        <input
          ref={fileRef}
          type="file"
          accept=".wav,.mp3,.ogg,.flac,.m4a,.aac,.wma,audio/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleFileUpload(f);
          }}
        />
        <button
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          className="px-4 py-1.5 text-sm bg-gray-800 hover:bg-gray-700 rounded-lg transition disabled:opacity-50"
        >
          {uploading
            ? "Uploading..."
            : hasClip
              ? "Replace clip"
              : "Upload audio"}
        </button>

        {/* YouTube toggle */}
        <button
          onClick={() => setShowYoutube(!showYoutube)}
          className="px-4 py-1.5 text-sm bg-gray-800 hover:bg-gray-700 rounded-lg transition"
        >
          {showYoutube ? "Cancel" : "From YouTube"}
        </button>
      </div>

      {/* YouTube URL input */}
      {showYoutube && (
        <div className="flex gap-2">
          <input
            type="text"
            placeholder="YouTube URL..."
            value={ytUrl}
            onChange={(e) => setYtUrl(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleYoutube()}
            className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-blue-500"
          />
          <button
            onClick={handleYoutube}
            disabled={!ytUrl.trim() || extracting}
            className="px-4 py-1.5 text-sm bg-blue-600 hover:bg-blue-700 rounded-lg transition disabled:opacity-50"
          >
            {extracting ? "Extracting..." : "Extract Voice"}
          </button>
        </div>
      )}
    </div>
  );
}

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

  const handleUpdate = (updated: Voice) => {
    setVoices((prev) => prev.map((v) => (v.id === updated.id ? updated : v)));
  };

  const handleDelete = async (id: number) => {
    await deleteVoice(id);
    setVoices((prev) => prev.filter((v) => v.id !== id));
  };

  return (
    <div>
      <h1 className="text-2xl font-bold mb-2">Voices</h1>
      <p className="text-gray-500 text-sm mb-6">
        Create a voice, then upload a WAV reference clip (6-15s clean speech) or extract from YouTube.
      </p>

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
          <VoiceCard
            key={voice.id}
            voice={voice}
            onUpdate={handleUpdate}
            onDelete={handleDelete}
          />
        ))}
      </div>
      {voices.length === 0 && (
        <p className="text-gray-500 text-center mt-8">
          No voices yet. Create one to get started.
        </p>
      )}
    </div>
  );
}
