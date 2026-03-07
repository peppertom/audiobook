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

      // 10 second countdown then auto-stop
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

  return (
    <div className="space-y-3">
      <h3 className="font-semibold text-sm text-gray-700">Érzelem-bank hangminták</h3>
      {error && (
        <div className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded">{error}</div>
      )}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {EMOTIONS.map((emotion) => {
          const hasClip = Boolean(emotionBank[emotion]);
          const isRecording = recording === emotion;
          const isUploading = uploading === emotion;

          return (
            <div
              key={emotion}
              className={`rounded-lg border p-3 text-sm ${hasClip ? "border-green-300 bg-green-50" : "border-gray-200 bg-white"}`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="font-medium">
                  {hasClip && <span className="text-green-600 mr-1">&#10003;</span>}
                  {EMOTION_LABELS[emotion]}
                </span>
                {hasClip && (
                  <button
                    onClick={() => handleDelete(emotion)}
                    className="text-xs text-red-500 hover:text-red-700"
                  >
                    Töröl
                  </button>
                )}
              </div>
              {emotionTexts[emotion] && (
                <p className="text-xs text-gray-500 italic mb-2 line-clamp-2">
                  {emotionTexts[emotion]}
                </p>
              )}
              <div className="flex gap-2">
                <button
                  disabled={isRecording || isUploading}
                  onClick={() => fileInputRefs.current[emotion]?.click()}
                  className="flex-1 rounded border border-gray-300 px-2 py-1 text-xs hover:bg-gray-50 disabled:opacity-50"
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
                    className="flex-1 rounded bg-red-500 text-white px-2 py-1 text-xs animate-pulse"
                  >
                    Stop ({countdown}s)
                  </button>
                ) : (
                  <button
                    disabled={isUploading}
                    onClick={() => startRecording(emotion)}
                    className="flex-1 rounded bg-indigo-600 text-white px-2 py-1 text-xs hover:bg-indigo-700 disabled:opacity-50"
                  >
                    {isUploading ? "Feltöltés..." : "Felvétel"}
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
