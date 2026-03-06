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
