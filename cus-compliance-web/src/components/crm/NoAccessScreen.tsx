"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "./AuthProvider";
import { ROLE_LABELS } from "@/lib/roles";

export function NoAccessScreen() {
  const router = useRouter();
  const { user, refresh, logoutLocal } = useAuth();
  const [pending, setPending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/access-requests");
        const data = await res.json();
        if (!cancelled && res.ok) {
          setPending(Boolean(data.request));
        }
      } catch {
        /* ignore */
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const logout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    logoutLocal();
    router.replace("/login");
  };

  const requestAccess = async () => {
    setError("");
    setInfo("");
    setSubmitting(true);
    try {
      const res = await fetch("/api/access-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Request failed");
      setPending(true);
      setInfo("Request sent. A Compliance Admin will review it.");
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <div className="w-full max-w-md rounded-[var(--radius)] border border-border bg-card p-6 text-center shadow-sm">
        <div className="mb-2 text-2xl">🔒</div>
        <div className="text-lg font-semibold text-foreground">
          No CRM access
        </div>
        <p className="mt-2 text-sm text-muted">
          {user
            ? `Signed in as ${user.email} (${ROLE_LABELS[user.role]}). Request Compliance User access to use the CRM.`
            : "Your account does not have permission to use the Compliance CRM."}
        </p>

        {!loading && !pending && (
          <div className="mt-4 space-y-3 text-left">
            <label className="flex flex-col gap-1 text-xs font-medium text-muted">
              Optional note for admin
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={3}
                maxLength={500}
                placeholder="Why you need access…"
                className="rounded-[var(--radius)] border border-border bg-input px-3 py-2 text-sm text-foreground outline-none focus:border-primary"
              />
            </label>
            <button
              type="button"
              disabled={submitting}
              onClick={() => void requestAccess()}
              className="inline-flex h-10 w-full items-center justify-center rounded-[var(--radius)] bg-primary px-4 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-60"
            >
              {submitting ? "Sending…" : "Request Compliance User access"}
            </button>
          </div>
        )}

        {!loading && pending && (
          <div className="mt-4 rounded-[var(--radius)] border border-warning/30 bg-warning/10 px-3 py-3 text-sm text-foreground">
            Your access request is pending. An admin will approve or deny it
            from the Admin Users page.
          </div>
        )}

        {error && (
          <p className="mt-3 text-sm text-danger" role="alert">
            {error}
          </p>
        )}
        {info && (
          <p className="mt-3 text-sm text-success" role="status">
            {info}
          </p>
        )}

        <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-center">
          <button
            type="button"
            onClick={() => void refresh()}
            className="inline-flex h-9 items-center justify-center rounded-[var(--radius)] border border-border bg-secondary px-4 text-sm font-medium hover:bg-border"
          >
            Refresh access
          </button>
          <button
            type="button"
            onClick={() => void logout()}
            className="inline-flex h-9 items-center justify-center rounded-[var(--radius)] border border-border bg-secondary px-4 text-sm font-medium hover:bg-border"
          >
            Logout
          </button>
        </div>
      </div>
    </div>
  );
}
