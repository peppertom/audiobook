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
