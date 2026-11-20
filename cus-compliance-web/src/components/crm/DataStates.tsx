"use client";

import { useCrm } from "./CrmProvider";

/** Small spinning ring used while data is loading / refreshing. */
export function Spinner({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <span
      className={`inline-block shrink-0 animate-spin rounded-full border-2 border-current border-t-transparent ${className}`}
      aria-hidden
    />
  );
}

/** Re-reads everything from the database (saving local edits first). */
export function RefreshDataButton({ className = "" }: { className?: string }) {
  const { refreshData, refreshing } = useCrm();
  return (
    <button
      type="button"
      disabled={refreshing}
      onClick={() => void refreshData()}
      className={`inline-flex h-9 items-center justify-center gap-2 rounded-(--radius) border border-border bg-secondary px-4 text-sm font-semibold transition-colors hover:bg-secondary/70 disabled:opacity-60 ${className}`}
    >
      {refreshing ? <Spinner /> : <span aria-hidden>↻</span>}
      {refreshing ? "Refreshing…" : "Refresh data"}
    </button>
  );
}

/** "Nothing here" message with a refresh button, for tables and lists. */
export function EmptyDataNotice({ message }: { message: string }) {
  const { refreshing } = useCrm();
  return (
    <div className="flex flex-col items-center gap-3 px-4 py-8 text-center">
      {refreshing ? (
        <div className="flex items-center gap-2 text-sm text-muted">
          <Spinner /> Loading data…
        </div>
      ) : (
        <p className="text-sm text-muted">{message}</p>
      )}
      <p className="max-w-sm text-xs text-muted">
        Expecting data? It may still be loading or was changed by someone else.
      </p>
      <RefreshDataButton />
    </div>
  );
}

/** Thin indeterminate bar pinned to the top of its (position: relative) parent. */
export function LoadingBar({ active, label = "Loading" }: { active: boolean; label?: string }) {
  if (!active) return null;
  return (
    <div className="ld-bar" role="progressbar" aria-busy="true" aria-label={label}>
      <span />
    </div>
  );
}

/** Spinner + label with a few placeholder lines - shown instead of a blank area while data loads. */
export function InlineLoading({
  label = "Loading…",
  lines = 5,
}: {
  label?: string;
  lines?: number;
}) {
  return (
    <div className="ld-inline" role="status" aria-live="polite">
      <div className="ld-inline-head">
        <Spinner className="h-5 w-5" />
        <span>{label}</span>
      </div>
      <div className="ld-inline-lines" aria-hidden>
        {Array.from({ length: lines }).map((_, i) => (
          <span key={i} style={{ width: `${92 - ((i * 13) % 38)}%` }} />
        ))}
      </div>
    </div>
  );
}
