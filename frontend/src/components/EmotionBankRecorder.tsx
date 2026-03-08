"use client";
import { useEffect, useRef, useState } from "react";
import { getEmotionTexts, uploadEmotionClip, deleteEmotionClip, EMOTION_LABELS } from "@/lib/api";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "";

interface EmotionBankRecorderProps {
  voiceId: number;
  emotionBank: Record<string, string>;
  onUpdate: () => void;
}

const EMOTIONS = ["neutral", "happy", "sad", "tense", "angry", "whisper"];

function EmotionCard({
  emotion,
  label,
  promptText,
  clipPath,
  voiceId,
  isRecording,
  countdown,
  isUploading,
  anyBusy,
  onRecord,
  onStop,
  onUpload,
  onDelete,
}: {
  emotion: string;
  label: string;
  promptText: string;
  clipPath: string | undefined;
  voiceId: number;
  isRecording: boolean;
  countdown: number;
  isUploading: boolean;
  anyBusy: boolean;
  onRecord: () => void;
  onStop: () => void;
  onUpload: (file: File) => void;
  onDelete: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);

  const hasClip = Boolean(clipPath);
  const audioUrl = hasClip ? `${API_BASE}/${clipPath}` : null;

  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (playing) { audio.pause(); } else { audio.play(); }
  };

  return (
    <div className={`rounded-lg border p-4 space-y-3 transition-colors ${
      hasClip ? "border-green-500/30 bg-green-900/10" : "border-gray-700 bg-gray-800/60"
    }`}>
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {hasClip && (
            <svg className="w-4 h-4 text-green-400 shrink-0" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
            </svg>
          )}
          <span className={`text-sm font-semibold ${hasClip ? "text-green-300" : "text-gray-200"}`}>
            {label}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {/* Play button */}
          {audioUrl && (
            <button
              onClick={togglePlay}
              className="w-7 h-7 flex items-center justify-center rounded-full bg-gray-700 hover:bg-gray-600 transition"
              title={playing ? "Megállít" : "Lejátszás"}
            >
              {playing ? (
                <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
                  <rect x="6" y="4" width="4" height="16" rx="1" />
                  <rect x="14" y="4" width="4" height="16" rx="1" />
                </svg>
              ) : (
                <svg className="w-3 h-3 ml-0.5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M8 5v14l11-7z" />
                </svg>
              )}
            </button>
          )}
          {/* Delete */}
          {hasClip && (
            <button
              onClick={onDelete}
              className="text-gray-500 hover:text-red-400 transition"
              title="Törlés"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Prompt text */}
      {promptText && (
        <p className="text-xs text-gray-400 leading-relaxed italic">
          {promptText}
        </p>
      )}

      {/* Audio element */}
      {audioUrl && (
        <audio
          ref={audioRef}
          src={audioUrl}
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onEnded={() => setPlaying(false)}
          preload="none"
        />
      )}

      {/* Action buttons */}
      <div className="flex gap-2">
        <input
          ref={fileRef}
          type="file"
          accept="audio/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) { onUpload(f); e.target.value = ""; }
          }}
        />
        <button
          disabled={anyBusy}
          onClick={() => fileRef.current?.click()}
          className="flex-1 rounded-lg border border-gray-600 px-3 py-1.5 text-xs text-gray-300 hover:bg-gray-700 hover:border-gray-500 transition disabled:opacity-30"
        >
          {isUploading ? "Feltöltés..." : "Fájl feltöltése"}
        </button>
        {isRecording ? (
          <button
            onClick={onStop}
            className="flex-1 rounded-lg bg-red-600 text-white px-3 py-1.5 text-xs animate-pulse hover:bg-red-500 transition font-medium"
          >
            ⏹ Stop — {countdown}s
          </button>
        ) : (
          <button
            disabled={anyBusy}
            onClick={onRecord}
            className="flex-1 rounded-lg bg-blue-600 text-white px-3 py-1.5 text-xs hover:bg-blue-500 transition disabled:opacity-30 font-medium"
          >
            ⏺ Felvétel
          </button>
        )}
      </div>
    </div>
  );
}

export function EmotionBankRecorder({ voiceId, emotionBank, onUpdate }: EmotionBankRecorderProps) {
  const [emotionTexts, setEmotionTexts] = useState<Record<string, string>>({});
  const [recording, setRecording] = useState<string | null>(null);
  const [countdown, setCountdown] = useState(0);
  const [uploading, setUploading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  useEffect(() => {
    getEmotionTexts().then(setEmotionTexts).catch(console.error);
  }, []);

  async function startRecording(emotion: string) {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream, { mimeType: "audio/webm" });
      chunksRef.current = [];
      mr.ondataavailable = (e) => chunksRef.current.push(e.data);
      mr.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        await handleUpload(emotion, blob, "recording.webm");
      };
      mediaRecorderRef.current = mr;
      mr.start();
      setRecording(emotion);
      let secs = 10;
      setCountdown(secs);
      const timer = setInterval(() => {
        secs--;
        setCountdown(secs);
        if (secs <= 0) { clearInterval(timer); mr.stop(); setRecording(null); }
      }, 1000);
    } catch {
      setError("Mikrofon hozzáférés megtagadva. Engedélyezd a böngészőben.");
    }
  }

  function stopRecording() {
    mediaRecorderRef.current?.stop();
    setRecording(null);
    setCountdown(0);
  }

  async function handleUpload(emotion: string, blob: Blob, filename: string) {
    setUploading(emotion);
    try {
      await uploadEmotionClip(voiceId, emotion, blob, filename);
      onUpdate();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Feltöltés sikertelen");
    } finally {
      setUploading(null);
    }
  }

  async function handleDelete(emotion: string) {
    try {
      await deleteEmotionClip(voiceId, emotion);
      onUpdate();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Törlés sikertelen");
    }
  }

  const doneCount = EMOTIONS.filter((e) => emotionBank[e]).length;
  const anyBusy = recording !== null || uploading !== null;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-gray-400">Érzelem-bank</span>
        <span className="text-xs text-gray-500">{doneCount} / {EMOTIONS.length} hangminta</span>
      </div>

      {error && (
        <div className="text-sm text-red-400 bg-red-900/20 border border-red-500/20 px-3 py-2 rounded-lg">
          {error}
        </div>
      )}

      <div className="space-y-2">
        {EMOTIONS.map((emotion) => (
          <EmotionCard
            key={emotion}
            emotion={emotion}
            label={EMOTION_LABELS[emotion]}
            promptText={emotionTexts[emotion] ?? ""}
            clipPath={emotionBank[emotion]}
            voiceId={voiceId}
            isRecording={recording === emotion}
            countdown={countdown}
            isUploading={uploading === emotion}
            anyBusy={anyBusy}
            onRecord={() => startRecording(emotion)}
            onStop={stopRecording}
            onUpload={(file) => handleUpload(emotion, file, file.name)}
            onDelete={() => handleDelete(emotion)}
          />
        ))}
      </div>
    </div>
  );
}
