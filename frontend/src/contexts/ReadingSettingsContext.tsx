"use client";
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  useCallback,
} from "react";
import { getUserSettings, updateUserSettings } from "@/lib/api";

export interface ReadingSettings {
  fontFamily: string;
  fontSize: number;
  lineHeight: number;
  wordSpacing: number;
  letterSpacing: number;
  maxWidth: number;
  theme: string;
  customBg: string;
  customText: string;
  focusLine: boolean;
}

const DEFAULTS: ReadingSettings = {
  fontFamily: "Literata",
  fontSize: 18,
  lineHeight: 1.7,
  wordSpacing: 0,
  letterSpacing: 0,
  maxWidth: 680,
  theme: "dark",
  customBg: "#1A1A2E",
  customText: "#E8E8E8",
  focusLine: false,
};

export const THEMES: Record<string, { bg: string; text: string; accent: string; name: string }> = {
  white:   { bg: "#FFFFFF", text: "#1A1A1A", accent: "#2563EB", name: "Fehér" },
  sepia:   { bg: "#F5F0E8", text: "#3B2F1E", accent: "#8B5E3C", name: "Szépia" },
  gray:    { bg: "#F0F0F0", text: "#2A2A2A", accent: "#4A4A8A", name: "Szürke" },
  dark:    { bg: "#1A1A2E", text: "#E8E8E8", accent: "#6C8EF5", name: "Sötét" },
  black:   { bg: "#000000", text: "#CCCCCC", accent: "#888888", name: "Fekete" },
  forest:  { bg: "#1C2B1A", text: "#D4E8D0", accent: "#7BC67B", name: "Erdő" },
  sunrise: { bg: "#FFF8F0", text: "#2D1B00", accent: "#E07A5F", name: "Napfelkelte" },
};

const THEME_ORDER = ["white", "sepia", "gray", "dark", "black", "forest", "sunrise"];

const LS_KEY = "reading_settings";

function loadFromLocalStorage(): Partial<ReadingSettings> {
  try {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveToLocalStorage(s: ReadingSettings) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(s));
  } catch {}
}

interface ReadingSettingsContextValue {
  settings: ReadingSettings;
  updateSetting: <K extends keyof ReadingSettings>(key: K, value: ReadingSettings[K]) => void;
  resetSettings: () => void;
  cycleTheme: () => void;
}

const ReadingSettingsContext = createContext<ReadingSettingsContextValue | null>(null);

export function ReadingSettingsProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<ReadingSettings>(DEFAULTS);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load: localStorage first (instant), then backend
  useEffect(() => {
    const ls = loadFromLocalStorage();
    if (Object.keys(ls).length > 0) {
      setSettings((prev) => ({ ...prev, ...ls }));
    }
    getUserSettings()
      .then((s) => {
        const fromApi: Partial<ReadingSettings> = {
          fontFamily: s.reading_font_family,
          fontSize: s.reading_font_size,
          lineHeight: s.reading_line_height,
          wordSpacing: s.reading_word_spacing,
          letterSpacing: s.reading_letter_spacing,
          maxWidth: s.reading_max_width,
          theme: s.reading_theme,
          customBg: s.reading_custom_bg,
          customText: s.reading_custom_text,
          focusLine: s.reading_focus_line,
        };
        setSettings((prev) => ({ ...prev, ...fromApi }));
      })
      .catch(() => {});
  }, []);

  // Apply CSS custom properties whenever settings change
  useEffect(() => {
    const root = document.documentElement;
    const theme = THEMES[settings.theme];
    const bg = theme ? theme.bg : settings.customBg;
    const text = theme ? theme.text : settings.customText;
    const accent = theme ? theme.accent : "#6C8EF5";

    root.style.setProperty("--reading-font", `var(--font-${settings.fontFamily.toLowerCase().replace(/\s+/g, "-").replace(/_/g, "-")}, ${settings.fontFamily}, Georgia, serif)`);
    root.style.setProperty("--reading-size", `${settings.fontSize}px`);
    root.style.setProperty("--reading-line-height", String(settings.lineHeight));
    root.style.setProperty("--reading-word-spacing", `${settings.wordSpacing / 10}em`);
    root.style.setProperty("--reading-letter-spacing", `${settings.letterSpacing / 10}em`);
    root.style.setProperty("--reading-max-width", `${settings.maxWidth}px`);
    root.style.setProperty("--reading-bg", bg);
    root.style.setProperty("--reading-text", text);
    root.style.setProperty("--reading-accent", accent);

    saveToLocalStorage(settings);
  }, [settings]);

  const persistToBackend = useCallback((next: ReadingSettings) => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      updateUserSettings({
        reading_font_family: next.fontFamily,
        reading_font_size: next.fontSize,
        reading_line_height: next.lineHeight,
        reading_word_spacing: next.wordSpacing,
        reading_letter_spacing: next.letterSpacing,
        reading_max_width: next.maxWidth,
        reading_theme: next.theme,
        reading_custom_bg: next.customBg,
        reading_custom_text: next.customText,
        reading_focus_line: next.focusLine,
      }).catch(() => {});
    }, 1500);
  }, []);

  const updateSetting = useCallback(
    <K extends keyof ReadingSettings>(key: K, value: ReadingSettings[K]) => {
      setSettings((prev) => {
        const next = { ...prev, [key]: value };
        persistToBackend(next);
        return next;
      });
    },
    [persistToBackend]
  );

  const resetSettings = useCallback(() => {
    setSettings(DEFAULTS);
    persistToBackend(DEFAULTS);
  }, [persistToBackend]);

  const cycleTheme = useCallback(() => {
    setSettings((prev) => {
      const idx = THEME_ORDER.indexOf(prev.theme);
      const next = { ...prev, theme: THEME_ORDER[(idx + 1) % THEME_ORDER.length] };
      persistToBackend(next);
      return next;
    });
  }, [persistToBackend]);

  return (
    <ReadingSettingsContext.Provider value={{ settings, updateSetting, resetSettings, cycleTheme }}>
      {children}
    </ReadingSettingsContext.Provider>
  );
}

export function useReadingSettings() {
  const ctx = useContext(ReadingSettingsContext);
  if (!ctx) throw new Error("useReadingSettings must be used within ReadingSettingsProvider");
  return ctx;
}
