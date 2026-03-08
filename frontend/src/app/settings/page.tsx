"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { getUserSettings, updateUserSettings, UserSettings } from "@/lib/api";
import { Loader2, Check, BookOpen } from "lucide-react";

const SPEED_OPTIONS = [0.5, 0.75, 1.0, 1.25, 1.5, 2.0];
const QUALITY_OPTIONS = ["standard", "high"];

export default function SettingsPage() {
  const { user } = useAuth();
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [original, setOriginal] = useState<UserSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    getUserSettings()
      .then((data) => {
        setSettings(data);
        setOriginal(data);
      })
      .catch(() => setError("Failed to load settings"))
      .finally(() => setLoading(false));
  }, [user]);

  const hasChanges =
    settings && original
      ? JSON.stringify(settings) !== JSON.stringify(original)
      : false;

  const handleSave = async () => {
    if (!settings) return;
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const updated = await updateUserSettings(settings);
      setSettings(updated);
      setOriginal(updated);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch {
      setError("Failed to save settings");
    } finally {
      setSaving(false);
    }
  };

  if (!user) {
    return (
      <div className="text-center py-16">
        <p className="text-gray-400">Sign in to view your settings.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="animate-spin text-gray-400" size={24} />
      </div>
    );
  }

  if (!settings) {
    return <p className="text-red-400">{error || "Failed to load settings"}</p>;
  }

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-bold mb-6">Settings</h1>

      {/* Reading settings shortcut */}
      <Link
        href="/settings/reading"
        className="flex items-center justify-between bg-gray-900 rounded-xl p-5 mb-6 hover:bg-gray-800/80 transition group"
      >
        <div className="flex items-center gap-3">
          <BookOpen size={20} className="text-blue-400" />
          <div>
            <p className="text-sm font-medium">Olvasási beállítások</p>
            <p className="text-xs text-gray-500 mt-0.5">Betűtípus, témák, fókusz mód</p>
          </div>
        </div>
        <span className="text-gray-600 group-hover:text-gray-400 transition">→</span>
      </Link>

      {/* Playback section */}
      <section className="bg-gray-900 rounded-xl p-6 mb-6">
        <h2 className="text-lg font-semibold mb-4">Playback</h2>

        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <label className="text-sm text-gray-300">Default speed</label>
            <select
              value={settings.playback_speed}
              onChange={(e) =>
                setSettings({ ...settings, playback_speed: Number(e.target.value) })
              }
              className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-gray-200 focus:outline-none focus:border-blue-500"
            >
              {SPEED_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {s}x
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center justify-between">
            <label className="text-sm text-gray-300">Audio quality</label>
            <select
              value={settings.audio_quality}
              onChange={(e) =>
                setSettings({ ...settings, audio_quality: e.target.value })
              }
              className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-gray-200 focus:outline-none focus:border-blue-500"
            >
              {QUALITY_OPTIONS.map((q) => (
                <option key={q} value={q}>
                  {q.charAt(0).toUpperCase() + q.slice(1)}
                </option>
              ))}
            </select>
          </div>
        </div>
      </section>

      {/* Notifications section */}
      <section className="bg-gray-900 rounded-xl p-6 mb-6">
        <h2 className="text-lg font-semibold mb-4">Notifications</h2>

        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={settings.email_notifications}
            onChange={(e) =>
              setSettings({ ...settings, email_notifications: e.target.checked })
            }
            className="w-4 h-4 rounded bg-gray-800 border-gray-600 text-blue-600 focus:ring-blue-500 focus:ring-offset-gray-900"
          />
          <span className="text-sm text-gray-300">
            Email me when a conversion is complete
          </span>
        </label>
      </section>

      {/* Save button */}
      <div className="flex items-center gap-3">
        <button
          onClick={handleSave}
          disabled={!hasChanges || saving}
          className="px-6 py-2 text-sm font-medium bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
        >
          {saving && <Loader2 size={16} className="animate-spin" />}
          {saving ? "Saving..." : "Save"}
        </button>

        {saved && (
          <span className="flex items-center gap-1 text-sm text-green-400">
            <Check size={16} />
            Saved
          </span>
        )}

        {error && <span className="text-sm text-red-400">{error}</span>}
      </div>

      {/* Danger zone */}
      <section className="mt-12 border border-red-900/50 rounded-xl p-6">
        <h2 className="text-lg font-semibold text-red-400 mb-2">Danger Zone</h2>
        <p className="text-sm text-gray-400 mb-4">
          Permanently delete your account and all associated data.
        </p>
        <button
          disabled
          className="px-4 py-2 text-sm bg-red-600/30 text-red-400 rounded-lg cursor-not-allowed"
          title="Not yet implemented"
        >
          Delete Account
        </button>
      </section>
    </div>
  );
}
