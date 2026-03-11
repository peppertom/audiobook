"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { approveUser, getPendingUsers, rejectUser, UserProfile } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";

export default function AdminPage() {
  const { user, isLoading: authLoading } = useAuth();
  const router = useRouter();
  const [pendingUsers, setPendingUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyUserId, setBusyUserId] = useState<string | null>(null);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.push("/auth/signin");
      return;
    }
    if (!user.is_admin) {
      router.push("/");
      return;
    }

    const loadPending = async () => {
      try {
        setLoading(true);
        setError(null);
        setPendingUsers(await getPendingUsers());
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load pending users");
      } finally {
        setLoading(false);
      }
    };

    loadPending();
  }, [authLoading, router, user]);

  const handleApprove = async (id: string) => {
    try {
      setBusyUserId(id);
      const approved = await approveUser(id);
      setPendingUsers((prev) => prev.filter((u) => u.id !== approved.id));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Approval failed");
    } finally {
      setBusyUserId(null);
    }
  };

  const handleReject = async (id: string) => {
    if (!confirm("Biztosan elutasítod és törlöd ezt a regisztrációt?")) return;
    try {
      setBusyUserId(id);
      await rejectUser(id);
      setPendingUsers((prev) => prev.filter((u) => u.id !== id));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Reject failed");
    } finally {
      setBusyUserId(null);
    }
  };

  if (authLoading || loading) {
    return <div className="p-6 text-gray-400">Loading admin panel...</div>;
  }

  if (!user?.is_admin) {
    return null;
  }

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Admin – Pending users</h1>
        <p className="text-sm text-gray-400 mt-1">
          Itt tudod jóváhagyni vagy elutasítani az új regisztrációkat.
        </p>
      </div>

      {error && (
        <div className="rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-red-300 text-sm">
          {error}
        </div>
      )}

      {pendingUsers.length === 0 ? (
        <div className="rounded-xl border border-gray-800 bg-gray-900/60 p-6 text-gray-400">
          Nincs jóváhagyásra váró user.
        </div>
      ) : (
        <div className="rounded-xl border border-gray-800 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-900/80 text-gray-300">
              <tr>
                <th className="text-left p-3">Name</th>
                <th className="text-left p-3">Email</th>
                <th className="text-left p-3">Created</th>
                <th className="text-right p-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {pendingUsers.map((u) => (
                <tr key={u.id} className="border-t border-gray-800/80">
                  <td className="p-3 text-white">{u.name || "-"}</td>
                  <td className="p-3 text-gray-300">{u.email}</td>
                  <td className="p-3 text-gray-400">
                    {new Date(u.created_at).toLocaleString()}
                  </td>
                  <td className="p-3 text-right space-x-2">
                    <button
                      className="px-3 py-1.5 rounded bg-emerald-600 hover:bg-emerald-500 text-white disabled:opacity-50"
                      onClick={() => handleApprove(u.id)}
                      disabled={busyUserId === u.id}
                    >
                      Approve
                    </button>
                    <button
                      className="px-3 py-1.5 rounded bg-rose-700 hover:bg-rose-600 text-white disabled:opacity-50"
                      onClick={() => handleReject(u.id)}
                      disabled={busyUserId === u.id}
                    >
                      Reject
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
