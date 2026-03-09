"use client";
import { useState } from "react";
import { useReadingSettings, THEMES } from "@/contexts/ReadingSettingsContext";

const FONTS = [
  { key: "Literata",                  label: "Literata",                  recommended: true,  desc: "Digitális olvasásra tervezve · Google Books" },
  { key: "Lora",                      label: "Lora",                      recommended: false, desc: "Elegáns, klasszikus könyv-feel" },
  { key: "Merriweather",              label: "Merriweather",              recommended: false, desc: "Képernyőre optimalizált" },
  { key: "Source_Serif_4",            label: "Source Serif 4",            recommended: false, desc: "Adobe prémium, változó súlyú" },
  { key: "EB_Garamond",               label: "EB Garamond",               recommended: false, desc: "Klasszikus irodalmi hangulat" },
  { key: "Libre_Baskerville",         label: "Libre Baskerville",         recommended: false, desc: "Könyv-tipográfia stílus" },
  { key: "Inter",                     label: "Inter",                     recommended: false, desc: "Modern, clean sans-serif" },
  { key: "Nunito",                    label: "Nunito",                    recommended: false, desc: "Lekerekített, barátságos" },
  { key: "Atkinson_Hyperlegible_Next",label: "Atkinson Hyperlegible",     recommended: true,  desc: "Akadálymentességre tervezve · maximális olvashatóság" },
];

const WORD_SPACING_PRESETS = [
  { label: "Normál",     value: 0 },
  { label: "Kényelmes",  value: 3 },
  { label: "Tág",        value: 6 },
];

const SIZE_PRESETS = [
  { label: "S", value: 14 },
  { label: "M", value: 18 },
  { label: "L", value: 24 },
];

interface SliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  display: string;
  onChange: (v: number) => void;
}

function Slider({ label, value, min, max, step, display, onChange }: SliderProps) {
  return (
    <div>
      <div className="flex justify-between text-xs mb-1 opacity-70">
        <span>{label}</span>
        <span className="tabular-nums">{display}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full h-1.5 rounded-full accent-blue-500 cursor-pointer"
      />
    </div>
  );
}

export default function TypographyPanel() {
  const { settings, updateSetting, resetSettings } = useReadingSettings();
  const [open, setOpen] = useState(false);
  const [fontTooltip, setFontTooltip] = useState<string | null>(null);

  const themeEntries = Object.entries(THEMES);

  return (
    <>
      {/* Floating toggle button */}
      <button
        onClick={() => setOpen((v) => !v)}
        className="fixed bottom-24 right-4 z-50 w-10 h-10 flex items-center justify-center rounded-full bg-gray-800 hover:bg-gray-700 border border-gray-700 shadow-lg transition"
        style={{ marginBottom: "env(safe-area-inset-bottom)" }}
        title="Szöveg beállítások"
        aria-label="Szöveg beállítások"
      >
        <span className="text-base leading-none">🔤</span>
      </button>

      {/* Panel */}
      {open && (
        <div
          className="fixed bottom-36 right-4 z-50 w-72 rounded-xl bg-gray-900 border border-gray-700 shadow-2xl text-sm overflow-hidden"
          style={{ marginBottom: "env(safe-area-inset-bottom)" }}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800">
            <span className="font-semibold text-xs uppercase tracking-wide opacity-60">Szöveg beállítások</span>
            <div className="flex items-center gap-2">
              <button
                onClick={resetSettings}
                className="text-xs text-gray-500 hover:text-gray-300 transition"
                title="Visszaállítás"
              >
                Visszaállítás
              </button>
              <button onClick={() => setOpen(false)} className="text-gray-500 hover:text-white transition text-base leading-none">
                ✕
              </button>
            </div>
          </div>

          <div className="px-4 py-3 space-y-4 max-h-[70vh] overflow-y-auto">
            {/* Font selector */}
            <div>
              <p className="text-xs opacity-60 mb-2">Betűtípus</p>
              <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1">
                {FONTS.map((f) => (
                  <button
                    key={f.key}
                    onClick={() => updateSetting("fontFamily", f.key)}
                    onMouseEnter={() => setFontTooltip(f.key)}
                    onMouseLeave={() => setFontTooltip(null)}
                    className={`relative shrink-0 px-2.5 py-2 rounded-lg border text-xs transition ${
                      settings.fontFamily === f.key
                        ? "border-blue-500 bg-blue-900/30 text-white"
                        : "border-gray-700 hover:border-gray-500 text-gray-300"
                    }`}
                    style={{ fontFamily: `var(--font-${f.key.toLowerCase().replace(/_/g, "-")}, ${f.label}, serif)` }}
                    title={f.desc}
                  >
                    {f.recommended && (
                      <span className="absolute -top-1.5 -right-1 text-[9px] bg-green-600 text-white rounded-full px-1 leading-4">★</span>
                    )}
                    <span>{f.label.split(" ")[0]}</span>
                    <span className="block text-[10px] opacity-60">Aa</span>
                  </button>
                ))}
              </div>
              {fontTooltip && (
                <p className="text-[11px] text-gray-500 mt-1">
                  {FONTS.find((f) => f.key === fontTooltip)?.desc}
                </p>
              )}
            </div>

            {/* Font size */}
            <div>
              <p className="text-xs opacity-60 mb-2">Betűméret</p>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => updateSetting("fontSize", Math.max(12, settings.fontSize - 1))}
                  className="w-7 h-7 flex items-center justify-center rounded bg-gray-800 hover:bg-gray-700 transition text-sm font-bold"
                >A-</button>
                <span className="flex-1 text-center text-xs tabular-nums opacity-80">{settings.fontSize}px</span>
                <button
                  onClick={() => updateSetting("fontSize", Math.min(32, settings.fontSize + 1))}
                  className="w-7 h-7 flex items-center justify-center rounded bg-gray-800 hover:bg-gray-700 transition text-sm font-bold"
                >A+</button>
                <div className="flex gap-1 ml-1">
                  {SIZE_PRESETS.map((p) => (
                    <button
                      key={p.label}
                      onClick={() => updateSetting("fontSize", p.value)}
                      className={`w-6 h-6 rounded text-xs transition ${
                        settings.fontSize === p.value
                          ? "bg-blue-600 text-white"
                          : "bg-gray-800 hover:bg-gray-700 text-gray-400"
                      }`}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Line height */}
            <Slider
              label="Sortávolság"
              value={settings.lineHeight}
              min={1.2} max={2.5} step={0.1}
              display={settings.lineHeight.toFixed(1)}
              onChange={(v) => updateSetting("lineHeight", v)}
            />

            {/* Word spacing */}
            <div>
              <div className="flex justify-between text-xs mb-1 opacity-70">
                <span>Szóköz</span>
                <span className="tabular-nums">{(settings.wordSpacing / 10).toFixed(2)}em</span>
              </div>
              <input
                type="range"
                min={0} max={10} step={1}
                value={settings.wordSpacing}
                onChange={(e) => updateSetting("wordSpacing", Number(e.target.value))}
                className="w-full h-1.5 rounded-full accent-blue-500 cursor-pointer mb-1.5"
              />
              <div className="flex gap-1">
                {WORD_SPACING_PRESETS.map((p) => (
                  <button
                    key={p.label}
                    onClick={() => updateSetting("wordSpacing", p.value)}
                    className={`flex-1 py-1 rounded text-xs transition ${
                      settings.wordSpacing === p.value
                        ? "bg-blue-600 text-white"
                        : "bg-gray-800 hover:bg-gray-700 text-gray-400"
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Letter spacing */}
            <Slider
              label="Betűköz"
              value={settings.letterSpacing}
              min={-2} max={5} step={1}
              display={`${(settings.letterSpacing / 10).toFixed(2)}em`}
              onChange={(v) => updateSetting("letterSpacing", v)}
            />

            {/* Max width */}
            <Slider
              label="Szövegoszlop szélesség"
              value={settings.maxWidth}
              min={480} max={900} step={20}
              display={`${settings.maxWidth}px`}
              onChange={(v) => updateSetting("maxWidth", v)}
            />

            {/* Themes */}
            <div>
              <p className="text-xs opacity-60 mb-2">Téma</p>
              <div className="grid grid-cols-4 gap-1.5">
                {themeEntries.map(([key, t]) => (
                  <button
                    key={key}
                    onClick={() => updateSetting("theme", key)}
                    title={t.name}
                    className={`rounded-lg p-2 border transition ${
                      settings.theme === key ? "border-blue-500 scale-105" : "border-gray-700 hover:border-gray-500"
                    }`}
                    style={{ backgroundColor: t.bg }}
                  >
                    <span className="block text-[10px] truncate" style={{ color: t.text }}>{t.name}</span>
                  </button>
                ))}
                {/* Custom theme */}
                <button
                  onClick={() => updateSetting("theme", "custom")}
                  title="Egyéni"
                  className={`rounded-lg p-2 border transition ${
                    settings.theme === "custom" ? "border-blue-500 scale-105" : "border-gray-700 hover:border-gray-500"
                  }`}
                  style={{ backgroundColor: settings.customBg }}
                >
                  <span className="block text-[10px]" style={{ color: settings.customText }}>Egyéni</span>
                </button>
              </div>
              {settings.theme === "custom" && (
                <div className="flex gap-2 mt-2">
                  <div className="flex-1">
                    <p className="text-[10px] opacity-50 mb-1">Háttér</p>
                    <input
                      type="color"
                      value={settings.customBg}
                      onChange={(e) => updateSetting("customBg", e.target.value)}
                      className="w-full h-8 rounded cursor-pointer border border-gray-700"
                    />
                  </div>
                  <div className="flex-1">
                    <p className="text-[10px] opacity-50 mb-1">Szöveg</p>
                    <input
                      type="color"
                      value={settings.customText}
                      onChange={(e) => updateSetting("customText", e.target.value)}
                      className="w-full h-8 rounded cursor-pointer border border-gray-700"
                    />
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
