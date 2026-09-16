"use client";

import { useCallback, useEffect, useState } from "react";
import { badgeClass } from "@/lib/crm";

// Google-Sheets-style column drag-to-reorder, shared across every table view.
// Order is keyed by a stable string per column (not position) and persisted
// to localStorage per-browser under `storageKey`, so it's a per-device
// preference only - it never touches the backend and resets if the browser's
// storage is cleared.
function loadColumnOrder(storageKey: string, keys: string[]): string[] {
  if (typeof window === "undefined") return keys;
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return keys;
    const parsed = JSON.parse(raw);
    if (
      Array.isArray(parsed) &&
      parsed.length === keys.length &&
      keys.every((k) => parsed.includes(k))
    ) {
      return parsed as string[];
    }
  } catch {
    // ignore malformed/blocked storage - fall back to default order
  }
  return keys;
}

export function useColumnOrder(storageKey: string, keys: string[]) {
  const [order, setOrder] = useState<string[]>(() =>
    loadColumnOrder(storageKey, keys)
  );
  const [draggingKey, setDraggingKey] = useState<string | null>(null);
  const [dragOverInfo, setDragOverInfo] = useState<
    { key: string; pos: "before" | "after" } | null
  >(null);

  // Keep in sync if the set of columns a page renders ever changes shape
  // (e.g. a future column added/removed) - otherwise a stale saved order
  // would silently drop or lose track of columns. Reset during render
  // (React's documented pattern) rather than in an effect, to avoid an
  // extra cascading render.
  const keysSignature = keys.join("|");
  const [prevKeysSignature, setPrevKeysSignature] = useState(keysSignature);
  if (prevKeysSignature !== keysSignature) {
    setPrevKeysSignature(keysSignature);
    if (order.length !== keys.length || !keys.every((k) => order.includes(k))) {
      setOrder(keys);
    }
  }

  useEffect(() => {
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(order));
    } catch {
      // ignore blocked storage (private mode, quota, etc.)
    }
  }, [storageKey, order]);

  const reorder = useCallback(
    (draggedKey: string, targetKey: string, after: boolean) => {
      if (draggedKey === targetKey) return;
      setOrder((prev) => {
        const fromIdx = prev.indexOf(draggedKey);
        const targetIdx = prev.indexOf(targetKey);
        if (fromIdx < 0 || targetIdx < 0) return prev;
        const next = [...prev];
        next.splice(fromIdx, 1);
        let insertAt = next.indexOf(targetKey);
        if (insertAt < 0) return prev;
        if (after) insertAt += 1;
        next.splice(insertAt, 0, draggedKey);
        return next;
      });
    },
    []
  );

  const onHeaderDragOver = (key: string) => (e: React.DragEvent) => {
    if (draggingKey == null || draggingKey === key) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    const rect = e.currentTarget.getBoundingClientRect();
    const pos: "before" | "after" =
      e.clientX - rect.left < rect.width / 2 ? "before" : "after";
    setDragOverInfo((prev) =>
      prev && prev.key === key && prev.pos === pos ? prev : { key, pos }
    );
  };

  const onHeaderDrop = (key: string) => (e: React.DragEvent) => {
    e.preventDefault();
    const draggedKey = draggingKey;
    const pos = dragOverInfo?.pos ?? "before";
    setDraggingKey(null);
    setDragOverInfo(null);
    if (draggedKey == null || draggedKey === key) return;
    reorder(draggedKey, key, pos === "after");
  };

  const onHeaderDragEnd = () => {
    setDraggingKey(null);
    setDragOverInfo(null);
  };

  const headerClass = (key: string) =>
    [
      draggingKey === key ? "opacity-40" : "",
      dragOverInfo?.key === key && dragOverInfo.pos === "before"
        ? "border-l-2 border-l-primary"
        : dragOverInfo?.key === key && dragOverInfo.pos === "after"
          ? "border-r-2 border-r-primary"
          : "",
    ]
      .filter(Boolean)
      .join(" ");

  const gripProps = (key: string) => ({
    draggable: true as const,
    onMouseDown: (e: React.MouseEvent) => e.stopPropagation(),
    onDragStart: (e: React.DragEvent) => {
      e.stopPropagation();
      setDraggingKey(key);
      e.dataTransfer.effectAllowed = "move" as const;
      e.dataTransfer.setData("text/plain", key);
    },
    onDragEnd: onHeaderDragEnd,
  });

  const headerProps = (key: string) => ({
    className: headerClass(key),
    onDragOver: draggingKey != null ? onHeaderDragOver(key) : undefined,
    onDrop: draggingKey != null ? onHeaderDrop(key) : undefined,
  });

  const resetOrder = () => setOrder(keys);

  return { order, gripProps, headerProps, resetOrder };
}

// Drop next to the other toolbar buttons on any page that uses
// useColumnOrder, to let a user undo a column drag they didn't mean to make.
export function ResetColumnsButton({ onReset }: { onReset: () => void }) {
  return (
    <button
      type="button"
      className="rounded border border-border bg-secondary px-3 py-1.5 text-xs"
      onClick={onReset}
      title="Restore this table's columns to their default order"
    >
      ↺ Reset Columns
    </button>
  );
}

// Shared fullscreen behaviour for the big data-table pages: hides the page's
// filters/toolbar chrome and expands the table to fill the viewport. `shellCls`
// goes on the page's outer wrapper div; the FiltersBar (and any other filter
// controls above the table) should be conditionally rendered with
// `{!fullscreen && (...)}`.
export function useFullscreen() {
  const [fullscreen, setFullscreen] = useState(false);
  const toggleFullscreen = () => setFullscreen((f) => !f);

  useEffect(() => {
    if (!fullscreen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setFullscreen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [fullscreen]);

  const shellCls = fullscreen
    ? "fixed inset-0 z-[3000] flex flex-col overflow-hidden bg-background"
    : "";
  return { fullscreen, toggleFullscreen, shellCls };
}

export function FullscreenButton({
  fullscreen,
  onToggle,
}: {
  fullscreen: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      className="rounded border border-border bg-secondary px-3 py-1.5 text-xs"
      onClick={onToggle}
    >
      {fullscreen ? "Exit Fullscreen" : "⛶ Fullscreen"}
    </button>
  );
}

// Floating exit control shown while fullscreen, since the page's normal
// title/toolbar (where the Fullscreen button normally lives) is hidden so
// only the table/data is visible. Also exits on Escape (see useFullscreen).
export function FullscreenExitFab({
  fullscreen,
  onExit,
}: {
  fullscreen: boolean;
  onExit: () => void;
}) {
  if (!fullscreen) return null;
  return (
    <button
      type="button"
      className="fixed right-4 top-4 z-[3100] rounded-full border border-border bg-card px-4 py-2 text-xs font-semibold shadow-lg"
      onClick={onExit}
      title="Exit Fullscreen (Esc)"
    >
      ✕ Exit Fullscreen
    </button>
  );
}

export function Badge({ label }: { label: string }) {
  return <span className={`badge ${badgeClass(label)}`}>{label}</span>;
}

export function RemarksCell({ children }: { children: React.ReactNode }) {
  return <div className="remarks">{children || "-"}</div>;
}

export function PaginationBar({
  total,
  page,
  pageSize,
  pageCount,
  onPageChange,
  onPageSizeChange,
  children,
}: {
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: 25 | 50 | 100) => void;
  children?: React.ReactNode;
}) {
  const start = total ? page * pageSize + 1 : 0;
  const end = Math.min(total, page * pageSize + pageSize);
  const options = [25, 50, 100];

  return (
    <div className="table-toolbar">
      <span className="pill">
        {total
          ? `Showing ${start}-${end} of ${total} · Page ${page + 1}/${pageCount}`
          : "No rows"}
      </span>
      <div className="table-toolbar-actions">
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          disabled={page <= 0}
          onClick={() => onPageChange(Math.max(0, page - 1))}
        >
          ◀ Prev
        </button>
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          disabled={page >= pageCount - 1}
          onClick={() => onPageChange(Math.min(pageCount - 1, page + 1))}
        >
          Next ▶
        </button>
        <label className="filter-group">
          <span className="filter-label">Rows</span>
          <select
            value={pageSize}
            onChange={(e) =>
              onPageSizeChange(Number(e.target.value) as 25 | 50 | 100)
            }
          >
            {options.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
        {children}
      </div>
    </div>
  );
}

export function usePagination<T>(
  items: T[],
  defaultSize: 25 | 50 | 100 = 50
) {
  const PAGE_SIZE_OPTIONS = [25, 50, 100] as const;
  const [pageSize, setPageSize] =
    useState<(typeof PAGE_SIZE_OPTIONS)[number]>(defaultSize);
  const [page, setPage] = useState(0);
  const pageCount = Math.max(1, Math.ceil(items.length / pageSize));
  const pageItems = items.slice(page * pageSize, page * pageSize + pageSize);

  useEffect(() => {
    setPage(0);
  }, [items.length]);

  useEffect(() => {
    setPage((p) => Math.min(p, pageCount - 1));
  }, [pageCount]);

  return {
    page,
    pageSize,
    pageCount,
    pageItems,
    setPage,
    setPageSize,
    PAGE_SIZE_OPTIONS,
  };
}

export function DataTableContainer({
  title,
  subtitle,
  actions,
  meta,
  toolbar,
  fullscreen,
  children,
}: {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
  meta?: React.ReactNode;
  toolbar?: React.ReactNode;
  fullscreen?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      className={`data-table-container ${fullscreen ? "flex-1 min-h-0 rounded-none border-0" : ""}`}
    >
      {!fullscreen && (
        <div className="table-header">
          <div>
            <div className="table-title">{title}</div>
            {subtitle && <div className="table-subtitle">{subtitle}</div>}
          </div>
          <div className="table-actions">
            {meta}
            {actions}
          </div>
        </div>
      )}
      {!fullscreen && toolbar}
      <div
        className={`table-scroll ${fullscreen ? "flex-1 !max-h-none" : ""}`}
      >
        {children}
      </div>
    </div>
  );
}

export function CrmTable({
  children,
  minWidth = "960px",
}: {
  children: React.ReactNode;
  minWidth?: string;
}) {
  return (
    <table className="data-table" style={{ minWidth }}>
      {children}
    </table>
  );
}

export function EmptyTableRow({
  colSpan,
  message,
}: {
  colSpan: number;
  message: string;
}) {
  return (
    <tr>
      <td colSpan={colSpan} className="empty-row">
        {message}
      </td>
    </tr>
  );
}

export function ChartCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="chart-card">
      <div className="table-title">{title}</div>
      {subtitle && <div className="table-subtitle mb-3">{subtitle}</div>}
      {children}
    </div>
  );
}

export function StatCard({
  label,
  value,
  sub,
  tone = "",
}: {
  label: string;
  value: string | number;
  sub?: string;
  tone?: "success" | "warning" | "info" | "danger" | "";
}) {
  return (
    <div className={`stat-card ${tone}`}>
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      {sub && <div className="stat-change">{sub}</div>}
    </div>
  );
}

export function MonthSelector({
  label,
  onPrev,
  onNext,
}: {
  label: string;
  onPrev: () => void;
  onNext: () => void;
}) {
  return (
    <div className="month-selector">
      <button type="button" className="btn btn-secondary btn-sm" onClick={onPrev}>
        ◀
      </button>
      <div className="month-display">{label}</div>
      <button type="button" className="btn btn-secondary btn-sm" onClick={onNext}>
        ▶
      </button>
    </div>
  );
}

/** @deprecated Use DataTableContainer */
export function TableShell({
  title,
  subtitle,
  children,
  actions,
  fullscreen,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  actions?: React.ReactNode;
  fullscreen?: boolean;
}) {
  return (
    <DataTableContainer
      title={title}
      subtitle={subtitle}
      actions={actions}
      fullscreen={fullscreen}
    >
      {children}
    </DataTableContainer>
  );
}
