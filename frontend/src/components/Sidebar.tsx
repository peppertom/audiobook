"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Library, Mic, ListOrdered, User, Settings, Gem, Shield,
} from "lucide-react";
import { useAuth } from "@/lib/auth-context";

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
  const { user } = useAuth();

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
        <div className="h-14 flex items-center px-5 border-b border-gray-800">
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

          {user?.is_admin && (
            <Link
              href="/admin"
              className={linkClass("/admin")}
              onClick={onClose}
            >
              <Shield size={18} />
              Admin
            </Link>
          )}

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
