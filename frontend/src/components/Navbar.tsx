"use client";

import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { LogOut, User, CreditCard } from "lucide-react";
import { NotificationBell } from "@/components/NotificationBell";
import { useState, useRef, useEffect } from "react";

export function Navbar() {
  const { user, logout, isLoading } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close menu on outside click
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
    <nav className="border-b border-gray-800 px-6 py-4">
      <div className="max-w-6xl mx-auto flex items-center gap-8">
        <Link href="/" className="text-xl font-bold">
          Audiobook
        </Link>
        <Link href="/" className="text-gray-400 hover:text-white transition-colors">
          Library
        </Link>
        <Link href="/voices" className="text-gray-400 hover:text-white transition-colors">
          Voices
        </Link>
        <Link href="/queue" className="text-gray-400 hover:text-white transition-colors">
          Queue
        </Link>

        {user && <NotificationBell />}

        <div className="relative" ref={menuRef}>
          {isLoading ? (
            <div className="w-8 h-8 rounded-full bg-gray-800 animate-pulse" />
          ) : user ? (
            <>
              <button
                onClick={() => setMenuOpen(!menuOpen)}
                className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors"
              >
                <div className="w-8 h-8 rounded-full bg-indigo-600 flex items-center justify-center text-sm font-medium text-white">
                  {user.name?.[0]?.toUpperCase() || user.email[0].toUpperCase()}
                </div>
                <span className="hidden sm:inline text-sm">{user.name || user.email}</span>
              </button>

              {menuOpen && (
                <div className="absolute right-0 top-full mt-2 w-56 bg-gray-900 border border-gray-700 rounded-lg shadow-xl py-1 z-50">
                  <div className="px-4 py-2 border-b border-gray-800">
                    <p className="text-sm font-medium text-white truncate">{user.name || "User"}</p>
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
                    href="/credits"
                    className="flex items-center gap-2 px-4 py-2 text-sm text-gray-300 hover:bg-gray-800 hover:text-white transition-colors"
                    onClick={() => setMenuOpen(false)}
                  >
                    <CreditCard size={16} />
                    Credits
                  </Link>
                  <button
                    onClick={() => {
                      logout();
                      setMenuOpen(false);
                    }}
                    className="flex items-center gap-2 w-full text-left px-4 py-2 text-sm text-gray-300 hover:bg-gray-800 hover:text-white transition-colors"
                  >
                    <LogOut size={16} />
                    Sign out
                  </button>
                </div>
              )}
            </>
          ) : (
            <Link
              href="/auth/signin"
              className="px-4 py-2 text-sm font-medium bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg transition-colors"
            >
              Sign in
            </Link>
          )}
        </div>
      </div>
    </nav>
  );
}
