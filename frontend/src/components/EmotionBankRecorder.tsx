"use client";
import { useEffect, useRef, useState } from "react";
import { getEmotionTexts, uploadEmotionClip, deleteEmotionClip, EMOTION_LABELS } from "@/lib/api";

interface EmotionBankRecorderProps {
  voiceId: number;
  emotionBank: Record<string, string>;
  onUpdate: () => void;
}

const EMOTIONS = ["neutral", "happy", "sad", "tense", "angry", "whisper"];

export function EmotionBankRecorder({ voiceId, emotionBank, onUpdate }: EmotionBankRecorderProps) {
  const [emotionTexts, setEmotionTexts] = useState<Record<string, string>>({});
  const [recording, setRecording] = useState<string | null>(null);
  const [countdown, setCountdown] = useState(0);
  const [uploading, setUploading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

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
        if (secs <= 0) {
          clearInterval(timer);
          mr.stop();
          setRecording(null);
        }
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

  async function handleFileChange(emotion: string, e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    await handleUpload(emotion, file, file.name);
    e.target.value = "";
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

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {EMOTIONS.map((emotion) => {
          const hasClip = Boolean(emotionBank[emotion]);
          const isRecording = recording === emotion;
          const isUploading = uploading === emotion;
          const busy = isRecording || isUploading || (!!recording && !isRecording) || (!!uploading && !isUploading);

          return (
            <div
              key={emotion}
              className={`rounded-lg border p-3 flex flex-col gap-2 transition-colors ${
                hasClip
                  ? "border-green-500/30 bg-green-900/10"
                  : "border-gray-700 bg-gray-800/60"
              }`}
            >
              {/* Header row */}
              <div className="flex items-center justify-between gap-1">
                <div className="flex items-center gap-1.5 min-w-0">
                  {hasClip && (
                    <svg className="w-3.5 h-3.5 text-green-400 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                  )}
                  <span className={`text-sm font-medium truncate ${hasClip ? "text-green-300" : "text-gray-200"}`}>
                    {EMOTION_LABELS[emotion]}
                  </span>
                </div>
                {hasClip && (
                  <button
                    onClick={() => handleDelete(emotion)}
                    className="text-gray-500 hover:text-red-400 transition shrink-0"
                    title="Törlés"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                )}
              </div>

              {/* Prompt text */}
              {emotionTexts[emotion] && (
                <p className="text-xs text-gray-500 italic leading-relaxed line-clamp-2">
                  {emotionTexts[emotion]}
                </p>
              )}

              {/* Action buttons */}
              <div className="flex gap-1.5 mt-auto">
                <button
                  disabled={busy}
                  onClick={() => fileInputRefs.current[emotion]?.click()}
                  className="flex-1 rounded-lg border border-gray-600 px-2 py-1.5 text-xs text-gray-300 hover:bg-gray-700 hover:border-gray-500 transition disabled:opacity-30"
                  title="Fájl feltöltése"
                >
                  Feltöltés
                </button>
                <input
                  ref={(el) => { fileInputRefs.current[emotion] = el; }}
                  type="file"
                  accept="audio/*"
                  className="hidden"
                  onChange={(e) => handleFileChange(emotion, e)}
                />
                {isRecording ? (
                  <button
                    onClick={stopRecording}
                    className="flex-1 rounded-lg bg-red-600 text-white px-2 py-1.5 text-xs animate-pulse hover:bg-red-500 transition"
                  >
                    Stop {countdown}s
                  </button>
                ) : (
                  <button
                    disabled={busy}
                    onClick={() => startRecording(emotion)}
                    className="flex-1 rounded-lg bg-blue-600 text-white px-2 py-1.5 text-xs hover:bg-blue-500 transition disabled:opacity-30"
                  >
                    {isUploading ? "..." : "Felvétel"}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
