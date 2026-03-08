"use client";
import { THEMES, useReadingSettings } from "@/contexts/ReadingSettingsContext";

// WCAG relative luminance + contrast ratio
function luminance(hex: string): number {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const toLinear = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
}

function contrastRatio(hex1: string, hex2: string): number {
  const l1 = luminance(hex1);
  const l2 = luminance(hex2);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

export default function ThemeSelector() {
  const { settings, updateSetting } = useReadingSettings();

  const customBg = settings.customBg;
  const customText = settings.customText;
  const customContrast = (() => {
    try { return contrastRatio(customBg, customText); } catch { return 0; }
  })();
  const customContrastOk = customContrast >= 4.5;

  return (
    <div>
      {/* Preset themes */}
      <div className="grid grid-cols-4 gap-2 mb-3">
        {Object.entries(THEMES).map(([key, theme]) => (
          <button
            key={key}
            onClick={() => updateSetting("theme", key)}
            title={theme.name}
            className={`rounded-lg p-2 text-xs font-medium border-2 transition-all ${
              settings.theme === key
                ? "border-blue-400 scale-105"
                : "border-transparent hover:border-gray-500"
            }`}
            style={{ backgroundColor: theme.bg, color: theme.text }}
          >
            {theme.name}
            {settings.theme === key && (
              <span className="block text-center text-[10px] mt-0.5 opacity-70">✓</span>
            )}
          </button>
        ))}
        {/* Custom theme card */}
        <button
          onClick={() => updateSetting("theme", "custom")}
          title="Egyéni"
          className={`rounded-lg p-2 text-xs font-medium border-2 transition-all ${
            settings.theme === "custom"
              ? "border-blue-400 scale-105"
              : "border-transparent hover:border-gray-500"
          }`}
          style={{
            background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
            color: "#fff",
          }}
        >
          Egyéni
          {settings.theme === "custom" && (
            <span className="block text-center text-[10px] mt-0.5 opacity-70">✓</span>
          )}
        </button>
      </div>

      {/* Custom color pickers */}
      {settings.theme === "custom" && (
        <div className="space-y-2 pt-2 border-t border-white/10">
          <div className="flex items-center justify-between">
            <label className="text-xs text-gray-400">Háttér</label>
            <input
              type="color"
              value={customBg}
              onChange={(e) => updateSetting("customBg", e.target.value)}
              className="w-8 h-7 rounded cursor-pointer border-0 bg-transparent"
            />
          </div>
          <div className="flex items-center justify-between">
            <label className="text-xs text-gray-400">Szöveg</label>
            <input
              type="color"
              value={customText}
              onChange={(e) => updateSetting("customText", e.target.value)}
              className="w-8 h-7 rounded cursor-pointer border-0 bg-transparent"
            />
          </div>
          {/* Contrast ratio */}
          <div className={`flex items-center justify-between text-xs mt-1 ${customContrastOk ? "text-green-400" : "text-red-400"}`}>
            <span>Kontraszt arány</span>
            <span className="font-mono">
              {customContrast.toFixed(1)}:1{" "}
              {customContrastOk ? "✓ WCAG AA" : "✗ Túl alacsony"}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
