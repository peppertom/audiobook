import type { Metadata } from "next";
import {
  Geist,
  Geist_Mono,
  Literata,
  Lora,
  Merriweather,
  Source_Serif_4,
  EB_Garamond,
  Libre_Baskerville,
  Inter,
  Nunito,
  Atkinson_Hyperlegible_Next,
} from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/lib/auth-context";
import { AppShell } from "@/components/AppShell";
import { ReadingSettingsProvider } from "@/contexts/ReadingSettingsContext";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

const literata = Literata({ variable: "--font-literata", subsets: ["latin"], display: "swap" });
const lora = Lora({ variable: "--font-lora", subsets: ["latin"], display: "swap" });
const merriweather = Merriweather({ variable: "--font-merriweather", subsets: ["latin"], display: "swap", weight: ["300", "400", "700"] });
const sourceSerif4 = Source_Serif_4({ variable: "--font-source-serif-4", subsets: ["latin"], display: "swap" });
const ebGaramond = EB_Garamond({ variable: "--font-eb-garamond", subsets: ["latin"], display: "swap" });
const libreBaskerville = Libre_Baskerville({ variable: "--font-libre-baskerville", subsets: ["latin"], display: "swap", weight: ["400", "700"] });
const inter = Inter({ variable: "--font-inter", subsets: ["latin"], display: "swap" });
const nunito = Nunito({ variable: "--font-nunito", subsets: ["latin"], display: "swap" });
const atkinson = Atkinson_Hyperlegible_Next({ variable: "--font-atkinson-hyperlegible-next", subsets: ["latin"], display: "swap" });

export const metadata: Metadata = {
  title: "AudioBookAI",
  description: "Turn your books into audiobooks with custom voices",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const fontVars = [
    geistSans.variable,
    geistMono.variable,
    literata.variable,
    lora.variable,
    merriweather.variable,
    sourceSerif4.variable,
    ebGaramond.variable,
    libreBaskerville.variable,
    inter.variable,
    nunito.variable,
    atkinson.variable,
  ].join(" ");

  return (
    <html lang="hu">
      <body className={`${fontVars} antialiased bg-gray-950 text-gray-100`}>
        <AuthProvider>
          <ReadingSettingsProvider>
            <AppShell>{children}</AppShell>
          </ReadingSettingsProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
