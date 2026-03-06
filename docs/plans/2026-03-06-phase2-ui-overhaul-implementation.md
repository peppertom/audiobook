# Phase 2: UI Overhaul — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Transform the frontend from a simple top-navbar layout into a sidebar-based app with persistent player bar, profile/settings pages, redesigned book cards, and library search/sort.

**Architecture:** Replace the current `<Navbar>` + centered `<main>` layout with a full-height flexbox layout: fixed Sidebar (left 240px) + TopBar + scrollable main content + conditional PlayerBar (bottom). Global audio state via React context. All client-side, no backend changes needed.

**Tech Stack:** Next.js 16 (App Router), React 19, TypeScript 5, Tailwind CSS 4, lucide-react icons. No test framework (manual verification via `next build` + browser).

**Note:** No test framework is configured in this project. Each task uses `next build` compilation and browser verification instead of automated tests.

---

### Task 1: Sidebar Component

**Files:**
- Create: `frontend/src/components/Sidebar.tsx`

**Step 1: Create Sidebar component**

```tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Library, Mic, ListOrdered, User, Settings, Gem,
} from "lucide-react";

const NAV_ITEMS = [
  { href: "/", label: "Library", icon: Library },
  { href: "/voices", label: "Voices", icon: Mic },
  { href: "/queue", label: "Queue", icon: ListOrdered },
];

const USER_ITEMS = [
  { href: "/profile", label: "Profile", icon: User },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function Sidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  const pathname = usePathname();

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  const linkClass = (href: string) =>
    `flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors ${
      isActive(href)
        ? "bg-gray-800 text-white border-l-2 border-indigo-500 ml-0 pl-[14px]"
        : "text-gray-400 hover:text-white hover:bg-gray-800/50"
    }`;

  return (
    <>
      {/* Mobile overlay backdrop */}
      {open && (
        <div
          className="fixed inset-0 bg-black/60 z-40 lg:hidden"
          onClick={onClose}
        />
      )}

      <aside
        className={`fixed top-0 left-0 h-full w-60 bg-gray-900 border-r border-gray-800 flex flex-col z-50 transition-transform duration-200 lg:translate-x-0 lg:static lg:z-auto ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {/* Logo */}
        <div className="px-5 py-5 border-b border-gray-800">
          <Link href="/" className="text-xl font-bold" onClick={onClose}>
            🎧 AudioBookAI
          </Link>
        </div>

        {/* Main nav */}
        <nav className="flex-1 px-3 py-4 space-y-1">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={linkClass(item.href)}
              onClick={onClose}
            >
              <item.icon size={18} />
              {item.label}
            </Link>
          ))}

          <div className="border-t border-gray-800 my-3" />

          {USER_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={linkClass(item.href)}
              onClick={onClose}
            >
              <item.icon size={18} />
              {item.label}
            </Link>
          ))}

          <div className="border-t border-gray-800 my-3" />

          <Link
            href="/upgrade"
            className="flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium text-amber-400 hover:bg-amber-400/10 transition-colors"
            onClick={onClose}
          >
            <Gem size={18} />
            Upgrade
          </Link>
        </nav>
      </aside>
    </>
  );
}
```

**Step 2: Verify build**

Run: `cd /Users/peppertom/Projects/audiobook/frontend && npx next build`
Expected: Build succeeds (Sidebar is not imported yet, just compiled)

**Step 3: Commit**

```bash
git add frontend/src/components/Sidebar.tsx
git commit -m "feat: add Sidebar navigation component"
```

---

### Task 2: TopBar Component

**Files:**
- Create: `frontend/src/components/TopBar.tsx`

**Step 1: Create TopBar component**

```tsx
"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { getCreditBalance } from "@/lib/api";
import { Menu, LogOut, User, Settings } from "lucide-react";

export function TopBar({ onMenuToggle }: { onMenuToggle: () => void }) {
  const { user, logout, isLoading } = useAuth();
  const [credits, setCredits] = useState<number | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Load credits
  useEffect(() => {
    if (user) {
      getCreditBalance()
        .then((data) => setCredits(data.balance))
        .catch(() => {});
    }
  }, [user]);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  return (
    <header className="h-14 bg-gray-900 border-b border-gray-800 flex items-center px-4 gap-4 shrink-0">
      {/* Hamburger — mobile only */}
      <button
        onClick={onMenuToggle}
        className="lg:hidden p-2 text-gray-400 hover:text-white transition-colors"
      >
        <Menu size={20} />
      </button>

      <div className="flex-1" />

      {/* Credits badge */}
      {user && credits !== null && (
        <Link
          href="/profile"
          className="px-3 py-1 rounded-full bg-blue-600/20 text-blue-400 text-xs font-medium hover:bg-blue-600/30 transition-colors"
        >
          💎 {credits} credits
        </Link>
      )}

      {/* User avatar / sign in */}
      {isLoading ? (
        <div className="w-8 h-8 rounded-full bg-gray-800 animate-pulse" />
      ) : user ? (
        <div className="relative" ref={menuRef}>
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className="w-8 h-8 rounded-full bg-indigo-600 flex items-center justify-center text-sm font-medium text-white hover:bg-indigo-500 transition-colors"
          >
            {user.name?.[0]?.toUpperCase() || user.email[0].toUpperCase()}
          </button>

          {menuOpen && (
            <div className="absolute right-0 top-full mt-2 w-56 bg-gray-900 border border-gray-700 rounded-lg shadow-xl py-1 z-50">
              <div className="px-4 py-2 border-b border-gray-800">
                <p className="text-sm font-medium text-white truncate">
                  {user.name || "User"}
                </p>
                <p className="text-xs text-gray-500 truncate">{user.email}</p>
              </div>
              <Link
                href="/profile"
                className="flex items-center gap-2 px-4 py-2 text-sm text-gray-300 hover:bg-gray-800 hover:text-white transition-colors"
                onClick={() => setMenuOpen(false)}
              >
                <User size={16} />
                Profile
              </Link>
              <Link
                href="/settings"
                className="flex items-center gap-2 px-4 py-2 text-sm text-gray-300 hover:bg-gray-800 hover:text-white transition-colors"
                onClick={() => setMenuOpen(false)}
              >
                <Settings size={16} />
                Settings
              </Link>
              <button
                onClick={() => { logout(); setMenuOpen(false); }}
                className="flex items-center gap-2 w-full text-left px-4 py-2 text-sm text-gray-300 hover:bg-gray-800 hover:text-white transition-colors"
              >
                <LogOut size={16} />
                Sign out
              </button>
            </div>
          )}
        </div>
      ) : (
        <Link
          href="/auth/signin"
          className="px-4 py-1.5 text-sm font-medium bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg transition-colors"
        >
          Sign in
        </Link>
      )}
    </header>
  );
}
```

**Step 2: Commit**

```bash
git add frontend/src/components/TopBar.tsx
git commit -m "feat: add TopBar component with credits badge and user menu"
```

---

### Task 3: Layout Shell — Replace Navbar with Sidebar + TopBar

**Files:**
- Modify: `frontend/src/app/layout.tsx`
- Create: `frontend/src/components/AppShell.tsx` (client component wrapper)

**Step 1: Create AppShell client component**

The layout.tsx is a server component (has `export const metadata`). We need a client component for the sidebar open/close state.

```tsx
// frontend/src/components/AppShell.tsx
"use client";

import { useState } from "react";
import { Sidebar } from "@/components/Sidebar";
import { TopBar } from "@/components/TopBar";

export function AppShell({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <div className="flex-1 flex flex-col min-w-0">
        <TopBar onMenuToggle={() => setSidebarOpen(!sidebarOpen)} />

        <main className="flex-1 overflow-y-auto">
          <div className="max-w-6xl mx-auto px-6 py-8">
            {children}
          </div>
        </main>

        {/* PlayerBar placeholder — Task 5 will add it here */}
      </div>
    </div>
  );
}
```

**Step 2: Update layout.tsx**

Replace the current layout.tsx content with:

```tsx
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/lib/auth-context";
import { AppShell } from "@/components/AppShell";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "AudioBookAI",
  description: "Turn your books into audiobooks with custom voices",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="hu">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-gray-950 text-gray-100`}
      >
        <AuthProvider>
          <AppShell>{children}</AppShell>
        </AuthProvider>
      </body>
    </html>
  );
}
```

**Step 3: Delete Navbar.tsx**

Remove `frontend/src/components/Navbar.tsx` — its functionality is now in Sidebar + TopBar.

Check if anything else imports it:
```bash
grep -r "Navbar" frontend/src/ --include="*.tsx" --include="*.ts"
```

Only `layout.tsx` should import it, and we've already replaced that import.

**Step 4: Verify build**

Run: `cd /Users/peppertom/Projects/audiobook/frontend && npx next build`
Expected: Build succeeds with all routes

**Step 5: Browser verify**

Open `http://localhost:3000` — should see sidebar on left, top bar with credits badge, main content in center.

**Step 6: Commit**

```bash
git add frontend/src/components/AppShell.tsx frontend/src/app/layout.tsx
git rm frontend/src/components/Navbar.tsx
git commit -m "feat: replace navbar with sidebar + topbar layout shell"
```

---

### Task 4: Profile Page

**Files:**
- Create: `frontend/src/app/profile/page.tsx`

**Step 1: Create profile page**

```tsx
"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { getCreditBalance, getCreditHistory, CreditTransaction } from "@/lib/api";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short", day: "numeric", year: "numeric",
  });
}

export default function ProfilePage() {
  const { user } = useAuth();
  const [credits, setCredits] = useState<number | null>(null);
  const [history, setHistory] = useState<CreditTransaction[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    Promise.all([
      getCreditBalance().then((d) => setCredits(d.balance)),
      getCreditHistory().then(setHistory),
    ])
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [user]);

  if (!user) {
    return (
      <div className="text-center py-16">
        <p className="text-gray-400">Sign in to view your profile.</p>
      </div>
    );
  }

  const initial = user.name?.[0]?.toUpperCase() || user.email[0].toUpperCase();

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-bold mb-6">Profile</h1>

      {/* User info */}
      <div className="flex items-center gap-4 mb-8">
        <div className="w-16 h-16 rounded-full bg-indigo-600 flex items-center justify-center text-2xl font-bold text-white">
          {initial}
        </div>
        <div>
          <p className="text-lg font-medium">{user.name || user.email}</p>
          <p className="text-sm text-gray-400">{user.email}</p>
          <p className="text-xs text-gray-500 mt-1">
            Member since {formatDate(user.created_at)}
          </p>
        </div>
      </div>

      {/* Credits */}
      <div className="bg-gray-900 rounded-xl p-6 mb-8">
        <h2 className="text-sm font-medium text-gray-400 mb-2">Credit Balance</h2>
        {loading ? (
          <div className="h-10 w-20 bg-gray-800 rounded animate-pulse" />
        ) : (
          <p className="text-4xl font-bold">
            {credits ?? 0}
            <span className="text-lg text-gray-400 ml-2">credits</span>
          </p>
        )}
        <button
          disabled
          className="mt-4 px-4 py-2 text-sm bg-blue-600/50 text-blue-300 rounded-lg cursor-not-allowed"
          title="Coming soon — Stripe integration"
        >
          Buy More Credits
        </button>
      </div>

      {/* Credit history */}
      <div>
        <h2 className="text-lg font-semibold mb-3">Credit History</h2>
        {loading ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-12 bg-gray-900 rounded-lg animate-pulse" />
            ))}
          </div>
        ) : history.length === 0 ? (
          <p className="text-gray-500 text-sm">No transactions yet.</p>
        ) : (
          <ul className="space-y-2">
            {history.map((tx) => (
              <li
                key={tx.id}
                className="flex items-center justify-between bg-gray-900 rounded-lg px-4 py-3"
              >
                <div>
                  <p className="text-sm">{tx.description || tx.type}</p>
                  <p className="text-xs text-gray-500">{formatDate(tx.created_at)}</p>
                </div>
                <span
                  className={`text-sm font-medium tabular-nums ${
                    tx.amount > 0 ? "text-green-400" : "text-red-400"
                  }`}
                >
                  {tx.amount > 0 ? "+" : ""}{tx.amount}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
```

**Step 2: Verify build**

Run: `cd /Users/peppertom/Projects/audiobook/frontend && npx next build`
Expected: `/profile` route generates successfully

**Step 3: Commit**

```bash
git add frontend/src/app/profile/page.tsx
git commit -m "feat: add profile page with credits and transaction history"
```

---

### Task 5: Settings Page

**Files:**
- Create: `frontend/src/app/settings/page.tsx`

**Step 1: Create settings page**

```tsx
"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { getUserSettings, updateUserSettings, UserSettings } from "@/lib/api";
import { Loader2, Check } from "lucide-react";

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
```

**Step 2: Verify build**

Run: `cd /Users/peppertom/Projects/audiobook/frontend && npx next build`
Expected: `/settings` route generates successfully

**Step 3: Commit**

```bash
git add frontend/src/app/settings/page.tsx
git commit -m "feat: add settings page with save functionality"
```

---

### Task 6: BookCard Redesign

**Files:**
- Modify: `frontend/src/components/BookCard.tsx`
- Modify: `frontend/src/lib/api.ts` (extend Book type with aggregated data)

**Step 1: Extend Book type in api.ts**

Add new fields to the Book interface for the redesigned card. These fields will be computed client-side from the BookDetail + Jobs data, so we'll create a richer type:

Add after the existing `CostEstimate` interface at the bottom of `api.ts`:

```typescript
// Enriched book for library display (computed client-side)
export interface BookWithStats extends Book {
  chapters_done: number;
  chapters_total: number;
  total_duration_seconds: number;
  has_active_jobs: boolean;
  voice_name?: string;
  voice_language?: string;
}
```

**Step 2: Rewrite BookCard.tsx**

Replace the entire content of `frontend/src/components/BookCard.tsx`:

```tsx
import Link from "next/link";
import { BookWithStats } from "@/lib/api";

function formatDuration(seconds: number): string {
  if (!seconds || seconds <= 0) return "";
  const hours = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

/** Generate a deterministic gradient from a string */
function titleGradient(title: string): string {
  let hash = 0;
  for (let i = 0; i < title.length; i++) {
    hash = title.charCodeAt(i) + ((hash << 5) - hash);
  }
  const h1 = Math.abs(hash % 360);
  const h2 = (h1 + 40) % 360;
  return `linear-gradient(135deg, hsl(${h1}, 60%, 30%), hsl(${h2}, 50%, 20%))`;
}

export default function BookCard({ book }: { book: BookWithStats }) {
  const progress =
    book.chapters_total > 0
      ? Math.round((book.chapters_done / book.chapters_total) * 100)
      : 0;

  const duration = formatDuration(book.total_duration_seconds);

  return (
    <Link
      href={`/books/${book.id}`}
      className="block bg-gray-900 rounded-xl overflow-hidden hover:bg-gray-800/80 hover:ring-1 hover:ring-gray-700 transition group"
    >
      {/* Cover placeholder */}
      <div
        className="h-28 flex items-center justify-center text-4xl"
        style={{ background: titleGradient(book.title) }}
      >
        📕
      </div>

      <div className="p-4 space-y-2.5">
        {/* Title + author */}
        <div>
          <h3 className="font-semibold truncate group-hover:text-white transition-colors">
            {book.title}
          </h3>
          <p className="text-gray-400 text-sm truncate">{book.author}</p>
        </div>

        {/* Progress bar */}
        {book.chapters_total > 0 && (
          <div>
            <div className="flex justify-between text-xs text-gray-500 mb-1">
              <span>
                {book.chapters_done}/{book.chapters_total} chapters
              </span>
              <span>{progress}%</span>
            </div>
            <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${
                  book.has_active_jobs
                    ? "bg-blue-500 animate-pulse"
                    : progress === 100
                      ? "bg-green-500"
                      : "bg-green-600"
                }`}
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        )}

        {/* Meta row */}
        <div className="flex items-center gap-2 text-xs text-gray-500">
          {book.voice_name && (
            <span className="flex items-center gap-1">
              🎙️ {book.voice_name}
            </span>
          )}
          {book.voice_language && (
            <span className="px-1.5 py-0.5 bg-gray-800 rounded text-gray-400">
              {book.voice_language}
            </span>
          )}
          {duration && (
            <span className="ml-auto">⏱️ {duration}</span>
          )}
          {book.has_active_jobs && (
            <span className="text-blue-400 ml-auto animate-pulse">
              Converting...
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}
```

**Step 3: Verify build**

Run: `cd /Users/peppertom/Projects/audiobook/frontend && npx next build`
Expected: Build succeeds

**Step 4: Commit**

```bash
git add frontend/src/components/BookCard.tsx frontend/src/lib/api.ts
git commit -m "feat: redesign BookCard with cover, progress bar, and duration"
```

---

### Task 7: Library Page Enhancements (Search + Sort + BookWithStats)

**Files:**
- Modify: `frontend/src/app/page.tsx`

**Step 1: Rewrite Library page with search, sort, and enriched book data**

Replace the entire content of `frontend/src/app/page.tsx`:

```tsx
"use client";

import { useEffect, useState, useMemo } from "react";
import { getBooks, getJobs, Book, Job, BookWithStats } from "@/lib/api";
import BookCard from "@/components/BookCard";
import FileUpload from "@/components/FileUpload";
import { Search } from "lucide-react";

type SortOption = "recent" | "title" | "author";

function enrichBooks(books: Book[], jobs: Job[]): BookWithStats[] {
  return books.map((book) => {
    const bookJobs = jobs.filter(
      (j) => j.book_title === book.title || false,
    );
    // We need to match by chapter — jobs have chapter_id but books have chapter_count
    // For now, use the jobs list: count done jobs per book
    const doneJobs = bookJobs.filter((j) => j.status === "done" && j.audio_output_path);
    const activeJobs = bookJobs.filter(
      (j) => j.status === "processing" || j.status === "queued",
    );

    const totalDuration = doneJobs.reduce(
      (sum, j) => sum + (j.duration_seconds ?? 0),
      0,
    );

    // Get voice info from first job
    const firstJob = doneJobs[0] || bookJobs[0];

    return {
      ...book,
      chapters_done: doneJobs.length,
      chapters_total: book.chapter_count,
      total_duration_seconds: totalDuration,
      has_active_jobs: activeJobs.length > 0,
      voice_name: firstJob?.voice_name ?? undefined,
      voice_language: undefined, // would need voice data
    };
  });
}

export default function LibraryPage() {
  const [books, setBooks] = useState<Book[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortOption>("recent");

  useEffect(() => {
    getBooks().then(setBooks).catch(() => {});
    getJobs().then(setJobs).catch(() => {});
  }, []);

  // Poll jobs for active status
  useEffect(() => {
    const hasActive = jobs.some(
      (j) => j.status === "processing" || j.status === "queued",
    );
    if (!hasActive) return;
    const interval = setInterval(() => {
      getJobs().then(setJobs).catch(() => {});
    }, 5000);
    return () => clearInterval(interval);
  }, [jobs]);

  const enriched = useMemo(() => enrichBooks(books, jobs), [books, jobs]);

  const filtered = useMemo(() => {
    let result = enriched;

    // Search filter
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (b) =>
          b.title.toLowerCase().includes(q) ||
          b.author.toLowerCase().includes(q),
      );
    }

    // Sort
    result = [...result].sort((a, b) => {
      switch (sort) {
        case "title":
          return a.title.localeCompare(b.title);
        case "author":
          return a.author.localeCompare(b.author);
        case "recent":
        default:
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      }
    });

    return result;
  }, [enriched, search, sort]);

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Library</h1>

      <FileUpload
        onUpload={(book) => setBooks((prev) => [book, ...prev])}
      />

      {/* Search + Sort */}
      {books.length > 0 && (
        <div className="flex items-center gap-3 mt-6">
          <div className="flex-1 relative">
            <Search
              size={16}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500"
            />
            <input
              type="text"
              placeholder="Search by title or author..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-gray-900 border border-gray-800 rounded-lg pl-9 pr-4 py-2 text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:border-gray-600 transition-colors"
            />
          </div>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortOption)}
            className="bg-gray-900 border border-gray-800 rounded-lg px-3 py-2 text-sm text-gray-300 focus:outline-none focus:border-gray-600"
          >
            <option value="recent">Recently added</option>
            <option value="title">Title A-Z</option>
            <option value="author">Author A-Z</option>
          </select>
        </div>
      )}

      {/* Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mt-6">
        {filtered.map((book) => (
          <BookCard key={book.id} book={book} />
        ))}
      </div>

      {books.length === 0 && (
        <div className="text-center py-16">
          <p className="text-4xl mb-4">📚</p>
          <p className="text-gray-400 text-lg mb-2">No books yet</p>
          <p className="text-gray-500 text-sm">
            Upload an EPUB file above to get started.
          </p>
        </div>
      )}

      {books.length > 0 && filtered.length === 0 && search && (
        <p className="text-gray-500 text-center mt-8">
          No books matching &quot;{search}&quot;
        </p>
      )}
    </div>
  );
}
```

**Step 2: Verify build**

Run: `cd /Users/peppertom/Projects/audiobook/frontend && npx next build`
Expected: Build succeeds

**Step 3: Browser verify**

Open `http://localhost:3000`:
- BookCards show cover gradient, progress bar, duration
- Search bar filters by title/author as you type
- Sort dropdown changes order

**Step 4: Commit**

```bash
git add frontend/src/app/page.tsx
git commit -m "feat: enhance library with search, sort, and enriched book cards"
```

---

### Task 8: PlayerContext — Global Audio State

**Files:**
- Create: `frontend/src/lib/player-context.tsx`

**Step 1: Create PlayerContext**

```tsx
"use client";

import {
  createContext, useContext, useState, useRef, useCallback, useEffect, ReactNode,
} from "react";

export interface TrackInfo {
  bookId: number;
  chapterId: number;
  audioUrl: string;
  bookTitle: string;
  chapterTitle: string;
  chapterNumber: number;
  voiceName?: string;
  /** All chapters in this book for skip next/prev */
  chapters?: Array<{ id: number; number: number; title: string; audioUrl: string | null }>;
}

interface PlayerContextType {
  /** Currently loaded track (null = nothing playing) */
  track: TrackInfo | null;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  playbackRate: number;
  volume: number;

  play: (track: TrackInfo) => void;
  pause: () => void;
  togglePlay: () => void;
  seek: (time: number) => void;
  setSpeed: (rate: number) => void;
  setVol: (vol: number) => void;
  skipChapter: (direction: 1 | -1) => void;
  stop: () => void;

  /** Ref to the single <audio> element — for advanced integrations */
  audioRef: React.RefObject<HTMLAudioElement | null>;
}

const PlayerContext = createContext<PlayerContextType | undefined>(undefined);

export function PlayerProvider({ children }: { children: ReactNode }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [track, setTrack] = useState<TrackInfo | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [volume, setVolume] = useState(1);

  const play = useCallback((newTrack: TrackInfo) => {
    const audio = audioRef.current;
    if (!audio) return;

    // If same track, just resume
    if (track?.audioUrl === newTrack.audioUrl) {
      audio.play();
      return;
    }

    // New track
    setTrack(newTrack);
    audio.src = newTrack.audioUrl;
    audio.playbackRate = playbackRate;
    audio.volume = volume;
    audio.play().catch(() => {});
  }, [track, playbackRate, volume]);

  const pause = useCallback(() => {
    audioRef.current?.pause();
  }, []);

  const togglePlay = useCallback(() => {
    const audio = audioRef.current;
    if (!audio || !track) return;
    if (isPlaying) audio.pause();
    else audio.play().catch(() => {});
  }, [isPlaying, track]);

  const seek = useCallback((time: number) => {
    const audio = audioRef.current;
    if (audio) audio.currentTime = time;
  }, []);

  const setSpeed = useCallback((rate: number) => {
    setPlaybackRate(rate);
    if (audioRef.current) audioRef.current.playbackRate = rate;
  }, []);

  const setVol = useCallback((vol: number) => {
    setVolume(vol);
    if (audioRef.current) audioRef.current.volume = vol;
  }, []);

  const skipChapter = useCallback((direction: 1 | -1) => {
    if (!track?.chapters) return;
    const currentIdx = track.chapters.findIndex((c) => c.id === track.chapterId);
    if (currentIdx === -1) return;
    const nextIdx = currentIdx + direction;
    if (nextIdx < 0 || nextIdx >= track.chapters.length) return;
    const next = track.chapters[nextIdx];
    if (!next.audioUrl) return;

    play({
      ...track,
      chapterId: next.id,
      chapterNumber: next.number,
      chapterTitle: next.title,
      audioUrl: next.audioUrl,
    });
  }, [track, play]);

  const stop = useCallback(() => {
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      audio.src = "";
    }
    setTrack(null);
    setIsPlaying(false);
    setCurrentTime(0);
    setDuration(0);
  }, []);

  return (
    <PlayerContext.Provider
      value={{
        track, isPlaying, currentTime, duration, playbackRate, volume,
        play, pause, togglePlay, seek, setSpeed, setVol, skipChapter, stop,
        audioRef,
      }}
    >
      {children}

      {/* Single global audio element */}
      <audio
        ref={audioRef}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onEnded={() => {
          setIsPlaying(false);
          // Auto-play next chapter
          skipChapter(1);
        }}
        onTimeUpdate={() => setCurrentTime(audioRef.current?.currentTime ?? 0)}
        onLoadedMetadata={() => setDuration(audioRef.current?.duration ?? 0)}
        preload="metadata"
      />
    </PlayerContext.Provider>
  );
}

export function usePlayer() {
  const ctx = useContext(PlayerContext);
  if (!ctx) throw new Error("usePlayer must be used within PlayerProvider");
  return ctx;
}
```

**Step 2: Verify build**

Run: `cd /Users/peppertom/Projects/audiobook/frontend && npx next build`
Expected: Build succeeds

**Step 3: Commit**

```bash
git add frontend/src/lib/player-context.tsx
git commit -m "feat: add global PlayerContext with single audio element"
```

---

### Task 9: PlayerBar — Persistent Bottom Player

**Files:**
- Create: `frontend/src/components/PlayerBar.tsx`
- Modify: `frontend/src/components/AppShell.tsx` (add PlayerProvider + PlayerBar)

**Step 1: Create PlayerBar component**

```tsx
"use client";

import { usePlayer } from "@/lib/player-context";
import { SkipBack, SkipForward, Play, Pause, Volume2 } from "lucide-react";

function formatTime(seconds: number): string {
  if (!isFinite(seconds) || seconds < 0) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

const SPEED_OPTIONS = [0.5, 0.75, 1, 1.25, 1.5, 2];

export function PlayerBar() {
  const {
    track, isPlaying, currentTime, duration, playbackRate, volume,
    togglePlay, seek, setSpeed, setVol, skipChapter,
  } = usePlayer();

  if (!track) return null;

  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    seek(ratio * duration);
  };

  const progress = duration ? (currentTime / duration) * 100 : 0;

  return (
    <div className="h-20 bg-gray-900 border-t border-gray-800 px-4 flex items-center gap-4 shrink-0">
      {/* Controls */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => skipChapter(-1)}
          className="p-1.5 text-gray-400 hover:text-white transition-colors"
          title="Previous chapter"
        >
          <SkipBack size={16} />
        </button>
        <button
          onClick={togglePlay}
          className="w-9 h-9 flex items-center justify-center rounded-full bg-white text-gray-900 hover:bg-gray-200 transition-colors"
        >
          {isPlaying ? <Pause size={16} /> : <Play size={16} className="ml-0.5" />}
        </button>
        <button
          onClick={() => skipChapter(1)}
          className="p-1.5 text-gray-400 hover:text-white transition-colors"
          title="Next chapter"
        >
          <SkipForward size={16} />
        </button>
      </div>

      {/* Track info + progress */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between mb-1">
          <p className="text-sm truncate">
            <span className="text-gray-400">Ch.{track.chapterNumber}</span>
            <span className="mx-1.5 text-gray-600">—</span>
            <span className="text-white">{track.bookTitle}</span>
          </p>
          <span className="text-xs text-gray-500 tabular-nums shrink-0 ml-3">
            {formatTime(currentTime)} / {formatTime(duration)}
          </span>
        </div>
        <div
          className="h-1.5 bg-gray-800 rounded-full cursor-pointer group"
          onClick={handleSeek}
        >
          <div
            className="h-full bg-blue-500 rounded-full relative transition-[width] duration-100"
            style={{ width: `${progress}%` }}
          >
            <div className="absolute right-0 top-1/2 -translate-y-1/2 w-3 h-3 bg-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity shadow" />
          </div>
        </div>
      </div>

      {/* Speed control */}
      <select
        value={playbackRate}
        onChange={(e) => setSpeed(Number(e.target.value))}
        className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-gray-300 focus:outline-none hidden sm:block"
      >
        {SPEED_OPTIONS.map((s) => (
          <option key={s} value={s}>
            {s}x
          </option>
        ))}
      </select>

      {/* Volume — desktop only */}
      <div className="hidden md:flex items-center gap-2">
        <Volume2 size={14} className="text-gray-500" />
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={volume}
          onChange={(e) => setVol(Number(e.target.value))}
          className="w-20 h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer"
        />
      </div>
    </div>
  );
}
```

**Step 2: Update AppShell to include PlayerProvider + PlayerBar**

Modify `frontend/src/components/AppShell.tsx`:

```tsx
"use client";

import { useState } from "react";
import { Sidebar } from "@/components/Sidebar";
import { TopBar } from "@/components/TopBar";
import { PlayerBar } from "@/components/PlayerBar";
import { PlayerProvider } from "@/lib/player-context";

export function AppShell({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <PlayerProvider>
      <div className="flex h-screen overflow-hidden">
        <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

        <div className="flex-1 flex flex-col min-w-0">
          <TopBar onMenuToggle={() => setSidebarOpen(!sidebarOpen)} />

          <main className="flex-1 overflow-y-auto">
            <div className="max-w-6xl mx-auto px-6 py-8">
              {children}
            </div>
          </main>

          <PlayerBar />
        </div>
      </div>
    </PlayerProvider>
  );
}
```

**Step 3: Delete old Player.tsx**

Remove `frontend/src/components/Player.tsx` — replaced by PlayerBar + PlayerContext.

Check nothing imports it:
```bash
grep -r "Player" frontend/src/ --include="*.tsx" --include="*.ts" | grep -v "PlayerBar\|PlayerContext\|PlayerProvider\|usePlayer\|ChapterPlayer\|player-context"
```

Only the old `components/Player.tsx` itself should remain. Safe to delete.

**Step 4: Verify build**

Run: `cd /Users/peppertom/Projects/audiobook/frontend && npx next build`
Expected: Build succeeds

**Step 5: Commit**

```bash
git add frontend/src/components/PlayerBar.tsx frontend/src/components/AppShell.tsx
git rm frontend/src/components/Player.tsx
git commit -m "feat: add persistent player bar with global audio controls"
```

---

### Task 10: Book Detail — PlayerContext Integration

**Files:**
- Modify: `frontend/src/app/books/[id]/page.tsx`

**Step 1: Refactor ChapterPlayer to use PlayerContext**

This is the most complex change. The ChapterPlayer currently has its own `<audio>` element. We need to:

1. Remove the local `<audio>` element
2. Use `usePlayer()` for play/pause/seek/time
3. Keep the text sync (reads `currentTime` from context)
4. Play button calls `player.play(trackInfo)` instead of local audio

**Key changes inside `ChapterPlayer`:**

- Remove: `audioRef`, local `playing`, `currentTime`, `duration`, `togglePlay`, `handleSeek` state
- Add: `const player = usePlayer();`
- The component checks `player.track?.chapterId === chapterId` to know if THIS chapter is the one playing
- If this chapter is active → show time/progress from `player.currentTime`/`player.duration`
- If not active → show static state with play button

**Also in the main `BookDetailPage`:**
- Build a `chapters` array with audioUrls for the player context (for skip chapter)
- Import `usePlayer` at the top

The full file is large (~420 lines), so the key modifications are:

1. Add `import { usePlayer } from "@/lib/player-context";` at top
2. In `ChapterPlayer`: replace local audio with player context
3. In `BookDetailPage`: prepare chapters list for player

**Step 2: Verify build**

Run: `cd /Users/peppertom/Projects/audiobook/frontend && npx next build`
Expected: Build succeeds

**Step 3: Browser verify**

1. Open a book with done chapters
2. Click play on a chapter → PlayerBar appears at bottom
3. Navigate to another page → audio keeps playing
4. Navigate back → chapter shows as active (synced)
5. Text sync highlighting still works

**Step 4: Commit**

```bash
git add frontend/src/app/books/\\[id\\]/page.tsx
git commit -m "feat: integrate book detail player with global PlayerContext"
```

---

### Task 11: Mobile Responsive Polish

**Files:**
- Modify: `frontend/src/components/Sidebar.tsx` (tablet collapsed mode)
- Verify all pages responsive

**Step 1: Add tablet collapsed state to Sidebar**

Add a `collapsed` prop and tablet behavior:

Sidebar already handles mobile (overlay via `open` prop + hamburger in TopBar). For tablet (768-1024px), add a CSS class that collapses to 64px width with only icons visible. This can be done via the existing Tailwind responsive classes:

```tsx
// In Sidebar's <aside>, update className:
// lg: = desktop (full sidebar always visible)
// md: = tablet (collapsed, icons only)
// default: mobile (hidden, overlay)
```

The existing implementation with `open` + `lg:translate-x-0 lg:static` already handles mobile/desktop. Tablet will need additional work with a `collapsed` state.

**Step 2: Verify all pages at different breakpoints**

Open browser dev tools, test at:
- 375px (mobile) — hamburger opens sidebar overlay
- 768px (tablet) — sidebar visible but narrow
- 1280px (desktop) — full sidebar

**Step 3: Commit**

```bash
git add frontend/src/components/Sidebar.tsx
git commit -m "feat: add responsive sidebar with mobile hamburger and tablet collapse"
```

---

### Task 12: Commit progress tracking changes + final verification

**Files:**
- Modified in earlier session: `backend/app/worker.py`, `backend/app/services/tts_engine.py`, `frontend/src/app/queue/page.tsx`

**Step 1: Commit the uncommitted progress tracking changes**

These 3 files were modified in the previous session but never committed:

```bash
git add backend/app/worker.py backend/app/services/tts_engine.py frontend/src/app/queue/page.tsx
git commit -m "feat: add word-level TTS progress tracking with elapsed time and ETA"
```

**Step 2: Full build verification**

Run: `cd /Users/peppertom/Projects/audiobook/frontend && npx next build`
Expected: All routes build successfully:
- `/` (Library with search + sort)
- `/auth/signin`
- `/auth/register`
- `/books/[id]`
- `/voices`
- `/queue`
- `/profile`
- `/settings`

**Step 3: Push**

```bash
git push origin main
```
