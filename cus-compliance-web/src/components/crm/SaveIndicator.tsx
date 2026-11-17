"use client";

import { useEffect, useState } from "react";
import { useCrm } from "./CrmProvider";

export function SaveIndicator() {
  const { syncStatus: st, flushSave } = useCrm();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (st.phase !== "retrying") return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [st.phase]);

  if (st.phase === "idle" && !st.journalFailed && !st.lastSavedAt) return null;

  const retryIn = st.retryAt ? Math.max(0, Math.ceil((st.retryAt - now) / 1000)) : 0;
  let icon = "✓";
  let label = "All changes saved";
  let color = "text-success";
  if (st.phase === "dirty") {
    icon = "●";
    label = `${st.pending} unsaved change${st.pending === 1 ? "" : "s"}`;
    color = "text-warning";
  } else if (st.phase === "saving") {
    icon = "⏳";
    label = `Saving ${st.pending} change${st.pending === 1 ? "" : "s"}…`;
    color = "text-primary";
  } else if (st.phase === "retrying") {
    icon = "⚠";
    label = `Not saved - ${st.error || "retrying"} (retry in ${retryIn}s) · click to retry`;
    color = "text-danger";
  } else if (st.phase === "auth") {
    icon = "🔒";
    label = "Session expired - changes kept on this device. Sign in again (new tab), then click here";
    color = "text-danger";
  }
  const clickable = st.phase === "retrying" || st.phase === "auth" || st.phase === "dirty";

  return (
    <div
      role={clickable ? "button" : "status"}
      onClick={clickable ? () => void flushSave() : undefined}
      className={`fixed bottom-[max(1rem,env(safe-area-inset-bottom))] left-1/2 z-1000 flex max-w-[92vw] -translate-x-1/2 items-center gap-2 rounded-full border border-border bg-card/95 px-3 py-1.5 text-[11px] shadow-sm backdrop-blur sm:left-auto sm:right-5 sm:translate-x-0 sm:rounded-(--radius) sm:px-4 sm:py-2 sm:text-xs ${color} ${clickable ? "cursor-pointer" : "pointer-events-none"}`}
    >
      <span>{icon}</span>
      <span>{label}</span>
      {st.journalFailed && (
        <span className="text-danger" title="Browser storage is full or blocked, so the local backup copy could not be written">
          · no local backup
        </span>
      )}
    </div>
  );
}
