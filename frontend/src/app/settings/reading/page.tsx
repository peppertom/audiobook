"use client";
import Link from "next/link";
import { useReadingSettings, THEMES } from "@/contexts/ReadingSettingsContext";
import FontSelector from "@/components/FontSelector";
import ThemeSelector from "@/components/ThemeSelector";

const SAMPLE_TEXT = `Az olvasás az emberi szellem egyik legősibb és leggazdagabb tapasztalata. Minden egyes mondat egy kapu, amely új világokba vezet — ismeretlen tájak, mélységes érzések, és felbecsülhetetlen tudás felé. A szavak a lapon nem csupán jelölések, hanem a gondolatok és álmok hírnökei.

Amikor elmélyülünk egy könyvben, az idő mintha megállna. A külső világ zaja elhalványul, és csak a szöveg marad — a sorok ritmusa, a mondatok dallama, az eszmék és képek végtelen sokasága. Az irodalom így válik a lélek tápláléká: gazdagítja képzeletünket, és tágítja határainkat.`;

function Slider({ label, value, min, max, step, display, onChange }: {
  label: string; value: number; min: number; max: number; step: number; display: string; onChange: (v: number) => void;
}) {
  return (
    <div>
      <div className="flex justify-between text-sm mb-1.5">
        <span className="text-gray-400">{label}</span>
        <span className="tabular-nums text-gray-300">{display}</span>
      </div>
      <input
        type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full h-1.5 rounded-full accent-blue-500 cursor-pointer"
      />
    </div>
  );
}

export default function ReadingSettingsPage() {
  const { settings, updateSetting, resetSettings } = useReadingSettings();

  const currentTheme = THEMES[settings.theme];
  const previewBg = currentTheme ? currentTheme.bg : settings.customBg;
  const previewText = currentTheme ? currentTheme.text : settings.customText;
  const fontVar = `--font-${settings.fontFamily.toLowerCase().replace(/\s+/g, "-").replace(/_/g, "-")}`;

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <Link href="/settings" className="text-gray-500 hover:text-gray-300 transition text-sm">
          ← Beállítások
        </Link>
        <h1 className="text-xl font-semibold">Olvasási beállítások</h1>
      </div>

      <div className="flex gap-6 items-start">
        {/* Left: settings */}
        <div className="flex-1 space-y-6 min-w-0">

          {/* Typography */}
          <section className="bg-gray-900 rounded-xl p-5">
            <h2 className="text-base font-semibold mb-4">🔤 Tipográfia</h2>
            <div className="space-y-5">
              <div>
                <p className="text-sm text-gray-400 mb-2">Betűtípus</p>
                <FontSelector />
              </div>

              {/* Font size */}
              <div>
                <div className="flex justify-between text-sm mb-1.5">
                  <span className="text-gray-400">Betűméret</span>
                  <span className="tabular-nums text-gray-300">{settings.fontSize}px</span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => updateSetting("fontSize", Math.max(12, settings.fontSize - 1))}
                    className="w-8 h-8 flex items-center justify-center rounded-lg bg-gray-800 hover:bg-gray-700 text-sm font-bold transition"
                  >A-</button>
                  <input
                    type="range" min={12} max={32} step={1} value={settings.fontSize}
                    onChange={(e) => updateSetting("fontSize", Number(e.target.value))}
                    className="flex-1 h-1.5 rounded-full accent-blue-500 cursor-pointer"
                  />
                  <button
                    onClick={() => updateSetting("fontSize", Math.min(32, settings.fontSize + 1))}
                    className="w-8 h-8 flex items-center justify-center rounded-lg bg-gray-800 hover:bg-gray-700 text-sm font-bold transition"
                  >A+</button>
                </div>
                <div className="flex gap-1 mt-2">
                  {[{ label: "S", value: 14 }, { label: "M", value: 18 }, { label: "L", value: 24 }].map(p => (
                    <button
                      key={p.label}
                      onClick={() => updateSetting("fontSize", p.value)}
                      className={`px-3 py-1 rounded text-xs transition ${settings.fontSize === p.value ? "bg-blue-600 text-white" : "bg-gray-800 hover:bg-gray-700 text-gray-400"}`}
                    >{p.label}</button>
                  ))}
                </div>
              </div>

              <Slider label="Sortávolság" value={settings.lineHeight} min={1.2} max={2.5} step={0.1}
                display={settings.lineHeight.toFixed(1)} onChange={(v) => updateSetting("lineHeight", v)} />

              <div>
                <div className="flex justify-between text-sm mb-1.5">
                  <span className="text-gray-400">Szóköz</span>
                  <span className="tabular-nums text-gray-300">{(settings.wordSpacing / 10).toFixed(2)}em</span>
                </div>
                <input type="range" min={0} max={10} step={1} value={settings.wordSpacing}
                  onChange={(e) => updateSetting("wordSpacing", Number(e.target.value))}
                  className="w-full h-1.5 rounded-full accent-blue-500 cursor-pointer mb-1.5" />
                <div className="flex gap-1">
                  {[{ label: "Normál", value: 0 }, { label: "Kényelmes", value: 3 }, { label: "Tág", value: 6 }].map(p => (
                    <button key={p.label} onClick={() => updateSetting("wordSpacing", p.value)}
                      className={`flex-1 py-1 rounded text-xs transition ${settings.wordSpacing === p.value ? "bg-blue-600 text-white" : "bg-gray-800 hover:bg-gray-700 text-gray-400"}`}
                    >{p.label}</button>
                  ))}
                </div>
              </div>

              <Slider label="Betűköz" value={settings.letterSpacing} min={-2} max={5} step={1}
                display={`${(settings.letterSpacing / 10).toFixed(2)}em`} onChange={(v) => updateSetting("letterSpacing", v)} />

              <Slider label="Szövegoszlop szélesség" value={settings.maxWidth} min={480} max={900} step={20}
                display={`${settings.maxWidth}px`} onChange={(v) => updateSetting("maxWidth", v)} />
            </div>
          </section>

          {/* Theme */}
          <section className="bg-gray-900 rounded-xl p-5">
            <h2 className="text-base font-semibold mb-4">🎨 Megjelenés</h2>
            <ThemeSelector />
          </section>

          {/* Reading experience */}
          <section className="bg-gray-900 rounded-xl p-5">
            <h2 className="text-base font-semibold mb-4">📖 Olvasási élmény</h2>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-300">Fókusz mód</p>
                  <p className="text-xs text-gray-500 mt-0.5">Csak az aktuális bekezdés látszik élesen</p>
                </div>
                <button
                  onClick={() => updateSetting("focusLine", !settings.focusLine)}
                  className={`relative w-10 h-6 rounded-full transition-colors ${settings.focusLine ? "bg-blue-600" : "bg-gray-700"}`}
                  role="switch" aria-checked={settings.focusLine}
                >
                  <span className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-transform ${settings.focusLine ? "translate-x-4" : ""}`} />
                </button>
              </div>
            </div>
          </section>

          {/* Reset */}
          <button
            onClick={resetSettings}
            className="w-full py-2.5 rounded-xl border border-gray-700 text-sm text-gray-400 hover:text-white hover:border-gray-500 transition"
          >
            Visszaállítás alapértelmezettre
          </button>
        </div>

        {/* Right: live preview */}
        <div className="w-80 shrink-0 sticky top-4">
          <p className="text-xs text-gray-500 mb-2 uppercase tracking-wide">Élő előnézet</p>
          <div
            className="rounded-xl p-6 overflow-hidden"
            style={{ backgroundColor: previewBg, color: previewText, transition: "background-color 0.3s ease, color 0.3s ease" }}
          >
            <p
              className="leading-relaxed"
              style={{
                fontFamily: `var(${fontVar}, ${settings.fontFamily}, Georgia, serif)`,
                fontSize: `${settings.fontSize}px`,
                lineHeight: settings.lineHeight,
                wordSpacing: `${settings.wordSpacing / 10}em`,
                letterSpacing: `${settings.letterSpacing / 10}em`,
              }}
            >
              {SAMPLE_TEXT.split("\n\n").map((para, i) => (
                <span key={i} className="block mb-4">{para}</span>
              ))}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
