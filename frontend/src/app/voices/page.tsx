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

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8001";

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
  const audioRef = useRef<HTMLAudioElement>(null);
  const [uploading, setUploading] = useState(false);
  const [ytUrl, setYtUrl] = useState("");
  const [extracting, setExtracting] = useState(false);
  const [showYoutube, setShowYoutube] = useState(false);
  const [playing, setPlaying] = useState(false);

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

  const togglePlayback = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (playing) {
      audio.pause();
      audio.currentTime = 0;
    } else {
      audio.play();
    }
  };

  const hasClip = !!voice.reference_clip_path;
  const clipUrl = hasClip ? `${API_BASE}/${voice.reference_clip_path}` : null;

  return (
    <div className="bg-gray-900 rounded-lg px-5 py-4 space-y-3">
      <div className="flex justify-between items-start">
        <div>
          <h3 className="font-semibold text-lg">{voice.name}</h3>
          <p className="text-gray-500 text-sm mt-0.5">
            {voice.language} &middot; {voice.source}
            {hasClip ? (
              <span className="text-green-400 ml-2">&#10003; Reference clip ready</span>
            ) : (
              <span className="text-yellow-400 ml-2">&#9888; No reference clip</span>
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

      {/* Audio player for reference clip */}
      {clipUrl && (
        <div className="flex items-center gap-3 bg-gray-800/60 rounded-lg px-4 py-2.5">
          <button
            onClick={togglePlayback}
            className="w-9 h-9 flex items-center justify-center rounded-full bg-blue-600 hover:bg-blue-500 transition shrink-0"
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
          <span className="text-sm text-gray-400">
            {playing ? "Playing reference clip..." : "Play reference clip"}
          </span>
          <audio
            ref={audioRef}
            src={clipUrl}
            onPlay={() => setPlaying(true)}
            onPause={() => setPlaying(false)}
            onEnded={() => setPlaying(false)}
            preload="none"
          />
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {/* Audio file upload */}
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
          {uploading ? "Uploading..." : hasClip ? "Replace clip" : "Upload audio"}
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
        Create a voice, then upload an audio reference clip (6-15s clean speech) or extract from YouTube.
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
