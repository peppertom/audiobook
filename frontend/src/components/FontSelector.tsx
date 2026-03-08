"use client";
import { useReadingSettings } from "@/contexts/ReadingSettingsContext";

const FONTS = [
  { name: "Literata", label: "Literata", recommended: true, description: "Digitális olvasásra tervezve · Google Books-ban is használt" },
  { name: "Atkinson_Hyperlegible_Next", label: "Atkinson", recommended: true, description: "Olvashatóságra optimalizált · Dyslexia-barát tervezés" },
  { name: "Merriweather", label: "Merriweather", recommended: false, description: "Képernyős olvasásra tervezett talpas betűtípus" },
  { name: "Lora", label: "Lora", recommended: false, description: "Elegáns, kalligráfiai ihletésű talpas font" },
  { name: "PT_Serif", label: "PT Serif", recommended: false, description: "Orosz tervezés, latin betűkre adaptálva" },
  { name: "Source_Serif_4", label: "Source Serif", recommended: false, description: "Adobe nyílt forráskódú serif fontja" },
  { name: "Inter", label: "Inter", recommended: false, description: "Modern groteszk · Kiváló képernyős olvashatóság" },
  { name: "Nunito", label: "Nunito", recommended: false, description: "Lekerekített groteszk · Barátságos megjelenés" },
  { name: "Georgia", label: "Georgia", recommended: false, description: "Klasszikus serif · Széles körben elérhető" },
];

export default function FontSelector() {
  const { settings, updateSetting } = useReadingSettings();

  return (
    <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
      {FONTS.map((font) => {
        const isActive = settings.fontFamily === font.name;
        const varName = `--font-${font.name.toLowerCase().replace(/\s+/g, "-").replace(/_/g, "-")}`;
        return (
          <button
            key={font.name}
            onClick={() => updateSetting("fontFamily", font.name)}
            title={font.description}
            className={`relative flex-none w-20 rounded-xl p-2 text-center border transition-all ${
              isActive
                ? "border-blue-500 bg-blue-500/10"
                : "border-white/10 hover:border-white/30 bg-white/5"
            }`}
          >
            {font.recommended && (
              <span className="absolute -top-1.5 left-1/2 -translate-x-1/2 text-[9px] bg-green-600 text-white px-1.5 py-0.5 rounded-full whitespace-nowrap">
                ★ Ajánlott
              </span>
            )}
            <span
              className="block text-lg leading-tight mt-1"
              style={{ fontFamily: `var(${varName}, ${font.name}, Georgia, serif)` }}
            >
              Aa
            </span>
            <span className="block text-[10px] text-gray-400 mt-0.5 truncate">{font.label}</span>
            {isActive && (
              <span className="block text-[10px] text-blue-400">✓</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
