import { useState, useEffect, useRef } from "react";
import type { ReadingSettings } from "@/contexts/ReadingSettingsContext";

export interface PaginationResult {
  pages: string[][];
  pageCount: number;
  isCalculating: boolean;
}

export function usePagination(
  paragraphs: string[],
  pageHeight: number,
  settings: ReadingSettings,
): PaginationResult {
  const [pages, setPages] = useState<string[][]>([]);
  const [isCalculating, setIsCalculating] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    debounceRef.current = setTimeout(() => {
      if (paragraphs.length === 0 || pageHeight <= 0) {
        setPages(paragraphs.length > 0 ? [paragraphs] : []);
        setIsCalculating(false);
        return;
      }

      setIsCalculating(true);

      // Off-screen probe div — same styles as reading container
      const probe = document.createElement("div");
      const probeWidth = Math.min(settings.maxWidth, window.innerWidth - 48);
      probe.style.cssText = [
        "position:absolute",
        "top:-9999px",
        "left:0",
        "visibility:hidden",
        "overflow:hidden",
        "box-sizing:border-box",
        `width:${probeWidth}px`,
        `height:${pageHeight}px`,
        "padding:2rem 1.5rem",
        `font-family:var(--reading-font,Georgia,serif)`,
        `font-size:${settings.fontSize}px`,
        `line-height:${settings.lineHeight}`,
        `word-spacing:${settings.wordSpacing / 10}em`,
        `letter-spacing:${settings.letterSpacing / 10}em`,
      ].join(";");
      document.body.appendChild(probe);

      const result: string[][] = [];
      let currentPage: string[] = [];

      const clearProbe = () => {
        while (probe.firstChild) probe.removeChild(probe.firstChild);
      };

      const appendPara = (text: string) => {
        const p = document.createElement("p");
        p.style.marginBottom = "1.2em";
        p.textContent = text;
        probe.appendChild(p);
      };

      for (const para of paragraphs) {
        appendPara(para);

        if (probe.scrollHeight <= probe.clientHeight) {
          // Fits on current page
          currentPage.push(para);
        } else {
          // Overflow — remove this paragraph
          probe.removeChild(probe.lastChild!);

          if (currentPage.length > 0) {
            // Save current page, start fresh
            result.push([...currentPage]);
            currentPage = [];
            clearProbe();
          }

          // Try this paragraph alone on a fresh page
          appendPara(para);
          if (probe.scrollHeight > probe.clientHeight) {
            // Still overflows even alone — force onto its own page
            result.push([para]);
            currentPage = [];
            clearProbe();
          } else {
            currentPage = [para];
          }
        }
      }

      if (currentPage.length > 0) {
        result.push(currentPage);
      }

      document.body.removeChild(probe);
      setPages(result.length > 0 ? result : [paragraphs]);
      setIsCalculating(false);
    }, 200);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [
    paragraphs,
    pageHeight,
    settings.fontSize,
    settings.lineHeight,
    settings.fontFamily,
    settings.maxWidth,
    settings.wordSpacing,
    settings.letterSpacing,
  ]);

  return { pages, pageCount: pages.length, isCalculating };
}
