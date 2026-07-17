"use client";

import { useCrm } from "./CrmProvider";

export function SaveIndicator() {
  const { saveState } = useCrm();
  const label =
    saveState === "saving"
      ? "Saving..."
      : saveState === "error"
        ? "Save failed"
        : saveState === "saved"
          ? "All changes saved"
          : "Auto-save ready";
  const icon =
    saveState === "saving"
      ? "⏳"
      : saveState === "error"
        ? "⚠"
        : saveState === "saved"
          ? "✓"
          : "💾";
  const color =
    saveState === "saving"
      ? "text-primary"
      : saveState === "error"
        ? "text-danger"
        : saveState === "saved"
          ? "text-success"
          : "text-muted";

  return (
    <div
      className={`pointer-events-none fixed bottom-[max(1rem,env(safe-area-inset-bottom))] left-1/2 z-[1000] flex -translate-x-1/2 items-center gap-2 rounded-full border border-border bg-card/95 px-3 py-1.5 text-[11px] shadow-sm backdrop-blur sm:left-auto sm:right-5 sm:translate-x-0 sm:rounded-[var(--radius)] sm:px-4 sm:py-2 sm:text-xs ${color}`}
    >
      <span>{icon}</span>
      <span className="whitespace-nowrap">{label}</span>
    </div>
  );
}
