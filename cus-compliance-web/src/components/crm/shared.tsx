"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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

// Google-Sheets-style column resize, shared across every table view that
// uses useColumnOrder. Widths are keyed by the same stable column key and
// persisted to localStorage per-browser under `storageKey`, independently
// from column order.
function loadColumnWidths(
  storageKey: string,
  keys: string[]
): Record<string, number> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object") {
      const next: Record<string, number> = {};
      for (const k of keys) {
        const v = (parsed as Record<string, unknown>)[k];
        if (typeof v === "number" && Number.isFinite(v)) next[k] = v;
      }
      return next;
    }
  } catch {
    // ignore malformed/blocked storage - fall back to default widths
  }
  return {};
}

const MIN_COL_WIDTH = 60;
const MAX_COL_WIDTH = 640;

// Either one width for every column, or a per-key map (with a fallback for
// keys it doesn't mention) - most sheets have a couple of columns that need
// to start wider or narrower than the rest (e.g. a name column vs. a date).
type ColumnDefaultWidth = number | Record<string, number>;

function resolveDefaultWidth(defaultWidth: ColumnDefaultWidth, key: string): number {
  if (typeof defaultWidth === "number") return defaultWidth;
  return defaultWidth[key] ?? defaultWidth.default ?? 140;
}

export function useColumnWidths(
  storageKey: string,
  keys: string[],
  defaultWidth: ColumnDefaultWidth = 140
) {
  const [widths, setWidths] = useState<Record<string, number>>(() =>
    loadColumnWidths(storageKey, keys)
  );

  useEffect(() => {
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(widths));
    } catch {
      // ignore blocked storage (private mode, quota, etc.)
    }
  }, [storageKey, widths]);

  const getWidth = useCallback(
    (key: string) => widths[key] ?? resolveDefaultWidth(defaultWidth, key),
    [widths, defaultWidth]
  );

  const colStyle = useCallback(
    (key: string): React.CSSProperties => {
      const w = getWidth(key);
      return { width: w, minWidth: w, maxWidth: w };
    },
    [getWidth]
  );

  // Native mouse events rather than HTML5 DnD (used for reorder above)
  // since resizing needs a continuous delta while dragging, not just a
  // single drop target.
  const resizeHandleProps = useCallback(
    (key: string) => ({
      onMouseDown: (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        const startX = e.clientX;
        const startWidth = widths[key] ?? resolveDefaultWidth(defaultWidth, key);
        const onMove = (ev: MouseEvent) => {
          const next = Math.min(
            MAX_COL_WIDTH,
            Math.max(MIN_COL_WIDTH, startWidth + (ev.clientX - startX))
          );
          setWidths((prev) => ({ ...prev, [key]: next }));
        };
        const onUp = () => {
          window.removeEventListener("mousemove", onMove);
          window.removeEventListener("mouseup", onUp);
        };
        window.addEventListener("mousemove", onMove);
        window.addEventListener("mouseup", onUp);
      },
      onClick: (e: React.MouseEvent) => e.stopPropagation(),
      onDragStart: (e: React.DragEvent) => e.preventDefault(),
      draggable: false as const,
    }),
    [widths, defaultWidth]
  );

  const resetWidths = () => setWidths({});

  return { widths, getWidth, colStyle, resizeHandleProps, resetWidths };
}

export function ColumnResizeHandle(
  props: ReturnType<ReturnType<typeof useColumnWidths>["resizeHandleProps"]>
) {
  return <span className="col-resize-handle" title="Drag to resize this column" {...props} />;
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
// Starts true so these table-heavy pages open straight into fullscreen -
// users asked to land on the full table rather than have to click the
// Fullscreen button every time.
export function useFullscreen() {
  const [fullscreen, setFullscreen] = useState(true);
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
// Parked bottom-center rather than a corner so it never sits over a header
// column, and stays invisible until the cursor nears the bottom edge (or it
// gets keyboard focus) so it doesn't otherwise cover table rows. On touch
// devices there's no hover to reveal it, so it's pinned visible (small and
// low-opacity, like a scrollbar) there instead.
export function FullscreenExitFab({
  fullscreen,
  onExit,
}: {
  fullscreen: boolean;
  onExit: () => void;
}) {
  if (!fullscreen) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-3100 flex justify-center">
      <div className="group pointer-events-auto flex h-28 w-56 items-end justify-center pb-1">
        <button
          type="button"
          className="translate-y-5 rounded-full border border-border bg-card px-4 py-2 text-xs font-semibold text-foreground opacity-0 shadow-lg transition-all duration-200 group-hover:translate-y-0 group-hover:opacity-100 focus-visible:translate-y-0 focus-visible:opacity-100 [@media(hover:none)]:translate-y-0 [@media(hover:none)]:opacity-70"
          onClick={onExit}
          title="Exit Fullscreen (Esc)"
        >
          ✕ Exit Fullscreen
        </button>
      </div>
    </div>
  );
}

export function Badge({ label }: { label: string }) {
  return <span className={`badge ${badgeClass(label)}`}>{label}</span>;
}

export function RemarksCell({ children }: { children: React.ReactNode }) {
  return <div className="remarks">{children || "-"}</div>;
}

// Blocking progress modal for useSheetGrid's paste-created-many-rows case
// (only shown once a paste creates 5+ new rows - see useSheetGrid).
export function PasteProgressOverlay({
  pasteProgress,
}: {
  pasteProgress: { done: number; total: number } | null;
}) {
  if (!pasteProgress) return null;
  return (
    <div className="fixed inset-0 z-5000 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div className="w-full max-w-sm rounded-[20px] border border-border bg-card p-6 text-center shadow-2xl">
        <div className="mb-3 text-2xl">📋</div>
        <div className="mb-1 text-sm font-semibold">Creating new rows…</div>
        <div className="mb-4 text-xs text-muted">
          {pasteProgress.done} of {pasteProgress.total} done
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-secondary">
          <div
            className="h-full rounded-full bg-primary transition-[width] duration-150"
            style={{
              width: `${Math.round((pasteProgress.done / pasteProgress.total) * 100)}%`,
            }}
          />
        </div>
      </div>
    </div>
  );
}

// Sits where PaginationBar used to (same "table-toolbar" styling) now that
// every table shows its full list at once instead of paging it - just a row
// count plus whatever toolbar actions (Reset Columns, Rows-per-page, etc.)
// the page still needs.
export function TableCountBar({
  total,
  children,
}: {
  total: number;
  children?: React.ReactNode;
}) {
  return (
    <div className="table-toolbar">
      <span className="pill">{total ? `${total} rows` : "No rows"}</span>
      <div className="table-toolbar-actions">{children}</div>
    </div>
  );
}

export function DataTableContainer({
  title,
  subtitle,
  actions,
  meta,
  toolbar,
  fullscreen,
  scrollRef,
  onPaste,
  children,
}: {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
  meta?: React.ReactNode;
  toolbar?: React.ReactNode;
  fullscreen?: boolean;
  // Lets a page reach its scroll container - e.g. useSheetGrid needs it to
  // scope its arrow-key cell-to-cell navigation lookups, and to focus it so
  // Ctrl+V/native paste actually has somewhere to land (see onPaste below).
  scrollRef?: React.RefObject<HTMLDivElement | null>;
  // Native paste only fires on the DOM node that currently has focus (or an
  // ancestor of it). Most sheet cells here aren't inputs, so useSheetGrid
  // focuses this div itself on cell-select (see its beginCellSelect) -
  // that's why the handler belongs here rather than deeper on <table>,
  // which sits *inside* this div and would never see an event that
  // originates on the div itself.
  onPaste?: (e: React.ClipboardEvent) => void;
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
        ref={scrollRef}
        tabIndex={onPaste ? -1 : undefined}
        onPaste={onPaste}
        className={`table-scroll ${fullscreen ? "flex-1 max-h-none!" : ""}`}
        style={onPaste ? { outline: "none" } : undefined}
      >
        {children}
      </div>
    </div>
  );
}

export function CrmTable({
  children,
  minWidth = "960px",
  resizable = false,
  selectable = false,
  onPaste,
}: {
  children: React.ReactNode;
  minWidth?: string;
  // Adds table-layout:fixed so header widths set via useColumnWidths are
  // respected exactly rather than only treated as a hint by the browser's
  // auto layout algorithm.
  resizable?: boolean;
  // Sheet-style click/drag cell selection (see useSheetGrid) - disables
  // native text selection on the table so dragging a range doesn't also
  // select the underlying text.
  selectable?: boolean;
  onPaste?: (e: React.ClipboardEvent) => void;
}) {
  return (
    <table
      className={`data-table ${resizable ? "data-table-resizable" : ""} ${selectable ? "sheet-selectable" : ""}`}
      style={{ minWidth }}
      onPaste={onPaste}
    >
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
  scrollRef,
  onPaste,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  actions?: React.ReactNode;
  fullscreen?: boolean;
  scrollRef?: React.RefObject<HTMLDivElement | null>;
  onPaste?: (e: React.ClipboardEvent) => void;
}) {
  return (
    <DataTableContainer
      title={title}
      subtitle={subtitle}
      actions={actions}
      fullscreen={fullscreen}
      scrollRef={scrollRef}
      onPaste={onPaste}
    >
      {children}
    </DataTableContainer>
  );
}

// ---------------------------------------------------------------------------
// Google-Sheets-style cell selection + copy/paste, generalized from Master
// P.O Sheet's bespoke version so every table view (Payment Target,
// Compliance, Daily Follow-up, ...) can offer the same click/drag range
// select, Ctrl+C copy-as-TSV, and paste-to-bulk-fill workflow, including
// creating new candidates when a paste has more rows than are visible.
// Master Sheet keeps its own richer implementation (installment-aware
// parsing, cross-column recompute) rather than being rebased onto this.

type SheetCellPos = { row: number; col: number };
type SheetRect = { r0: number; r1: number; c0: number; c1: number };

export type SheetColumn<T> = {
  key: string;
  editable: boolean;
  getText: (row: T) => string;
  // Only invoked for editable columns; mutate `row` in place with the
  // pasted text for this column.
  applyText?: (row: T, text: string) => void;
};

export function useSheetGrid<T extends { id: number }>({
  rows,
  columns,
  allRows,
  setAllRows,
  queueSave,
  snapshot,
  toast,
  createBlankRow,
  normalize,
  overflowNote,
}: {
  rows: T[];
  columns: SheetColumn<T>[];
  allRows: T[];
  setAllRows: (next: T[]) => void;
  queueSave: () => void;
  snapshot: () => void;
  toast: (message: string, type?: "success" | "error" | "info") => void;
  createBlankRow: () => T;
  normalize?: (row: T) => T;
  overflowNote?: string;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  // A visually-hidden, always-empty textarea that gets focused whenever a
  // non-input cell is selected. Clipboard copy/paste/cut events only fire
  // reliably on elements with native text editing (input/textarea) or
  // contenteditable - a plain focused <div> is NOT a dependable target for
  // them across browsers. Most cells here are plain text/badges, so without
  // this there's often nothing focused at all for Ctrl+V to land on. This
  // mirrors the standard technique spreadsheet clones use (Google Sheets
  // included) rather than relying on div focus or clipboard-read permission.
  const hiddenRef = useRef<HTMLTextAreaElement>(null);

  const [ranges, setRanges] = useState<SheetRect[]>([]);
  const [liveAnchor, setLiveAnchor] = useState<SheetCellPos | null>(null);
  const [liveFocus, setLiveFocus] = useState<SheetCellPos | null>(null);
  const draggingRef = useRef(false);
  const [pasteProgress, setPasteProgress] = useState<
    { done: number; total: number } | null
  >(null);

  useEffect(() => {
    const up = () => {
      draggingRef.current = false;
    };
    window.addEventListener("mouseup", up);
    return () => window.removeEventListener("mouseup", up);
  }, []);

  // Clear a stale selection if the visible row set changes size underneath
  // it (e.g. a filter changes) - adjusted during render, React's documented
  // pattern for resetting state from a derived value, to avoid an extra
  // cascading render.
  const [prevRowCount, setPrevRowCount] = useState(rows.length);
  if (prevRowCount !== rows.length) {
    setPrevRowCount(rows.length);
    if (ranges.length || liveAnchor || liveFocus) {
      setRanges([]);
      setLiveAnchor(null);
      setLiveFocus(null);
    }
  }

  const liveRect: SheetRect | null =
    liveAnchor && liveFocus
      ? {
          r0: Math.min(liveAnchor.row, liveFocus.row),
          r1: Math.max(liveAnchor.row, liveFocus.row),
          c0: Math.min(liveAnchor.col, liveFocus.col),
          c1: Math.max(liveAnchor.col, liveFocus.col),
        }
      : null;
  const allRects = useMemo(
    () => (liveRect ? [...ranges, liveRect] : ranges),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ranges, liveAnchor, liveFocus]
  );
  const hasSelection = allRects.length > 0;

  const isCellSelected = useCallback(
    (row: number, col: number) =>
      allRects.some(
        (r) => row >= r.r0 && row <= r.r1 && col >= r.c0 && col <= r.c1
      ),
    [allRects]
  );

  const commitLiveRange = () => {
    if (liveRect) setRanges((prev) => [...prev, liveRect]);
  };

  const beginCellSelect = useCallback(
    (row: number, col: number, e: React.MouseEvent) => {
      draggingRef.current = true;
      // Send focus to the hidden capture field so native copy/paste has a
      // reliable target, unless the click landed on a real form control,
      // which should keep native focus (and its own native paste) for
      // itself - e.g. pasting a single value directly into one input field.
      const isFormEl =
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLSelectElement ||
        e.target instanceof HTMLTextAreaElement;
      if (!isFormEl) hiddenRef.current?.focus({ preventScroll: true });
      if (e.ctrlKey || e.metaKey) {
        commitLiveRange();
        setLiveAnchor({ row, col });
        setLiveFocus({ row, col });
      } else if (e.shiftKey && liveAnchor) {
        setLiveFocus({ row, col });
      } else {
        setRanges([]);
        setLiveAnchor({ row, col });
        setLiveFocus({ row, col });
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [liveAnchor]
  );
  const extendCellSelect = useCallback((row: number, col: number) => {
    if (draggingRef.current) setLiveFocus({ row, col });
  }, []);

  const rectsToTsv = useCallback(
    (rects: SheetRect[]) => {
      const r0 = Math.min(...rects.map((r) => r.r0));
      const r1 = Math.max(...rects.map((r) => r.r1));
      const c0 = Math.min(...rects.map((r) => r.c0));
      const c1 = Math.max(...rects.map((r) => r.c1));
      const inSelection = (r: number, c: number) =>
        rects.some((rect) => r >= rect.r0 && r <= rect.r1 && c >= rect.c0 && c <= rect.c1);
      const outRows: string[] = [];
      for (let r = r0; r <= r1; r++) {
        const row = rows[r];
        if (!row) continue;
        const cells: string[] = [];
        for (let c = c0; c <= c1; c++) {
          cells.push(inSelection(r, c) ? columns[c]?.getText(row) ?? "" : "");
        }
        outRows.push(cells.join("\t"));
      }
      return outRows.join("\n");
    },
    [rows, columns]
  );

  const copySelection = useCallback(() => {
    if (!allRects.length) return;
    const text = rectsToTsv(allRects);
    navigator.clipboard.writeText(text).then(
      () => toast("Selection copied", "success"),
      () => toast("Copy failed - clipboard permission blocked", "error")
    );
  }, [allRects, rectsToTsv, toast]);

  const pasteAnchor = (): SheetCellPos | null => {
    if (!allRects.length) return null;
    const r0 = Math.min(...allRects.map((r) => r.r0));
    const c0 = Math.min(...allRects.map((r) => r.c0));
    return { row: r0, col: c0 };
  };

  const applyRowFields = useCallback(
    (row: T, rowText: string, anchorCol: number) => {
      rowText.split("\t").forEach((val, ci) => {
        const colDef = columns[anchorCol + ci];
        if (!colDef || !colDef.editable || !colDef.applyText) return;
        colDef.applyText(row, val.trim());
      });
    },
    [columns]
  );

  const runPaste = useCallback(
    async (text: string, anchor: SheetCellPos, ids: number[], startRow: number) => {
      const pastedRows = text.replace(/\r/g, "").split("\n").filter(Boolean);
      const existingSlots = Math.max(0, ids.length - startRow);
      const totalNew = Math.max(0, pastedRows.length - existingSlots);
      const showProgress = totalNew >= 5;
      if (showProgress) setPasteProgress({ done: 0, total: totalNew });

      let next = [...allRows];
      let created = 0;
      for (let ri = 0; ri < pastedRows.length; ri++) {
        const id = ids[startRow + ri];
        let ci: number;
        if (id != null) {
          ci = next.findIndex((r) => r.id === id);
          if (ci < 0) continue;
        } else {
          next.push(createBlankRow());
          ci = next.length - 1;
          created += 1;
          if (showProgress) {
            setPasteProgress({ done: created, total: totalNew });
            if (created % 4 === 0) {
              await new Promise((resolve) => setTimeout(resolve, 0));
            }
          }
        }
        const row = { ...next[ci] };
        applyRowFields(row, pastedRows[ri], anchor.col);
        next[ci] = row;
      }

      if (normalize) {
        next = next.map((r) => {
          const orig = allRows.find((x) => x.id === r.id);
          return orig === r ? r : normalize(r);
        });
      }
      setAllRows(next);
      queueSave();
      setPasteProgress(null);
      toast(
        created > 0
          ? `Paste applied - ${created} new row${created > 1 ? "s" : ""} created${
              overflowNote ? ". " + overflowNote : ""
            }`
          : "Paste applied",
        "success"
      );
    },
    [allRows, createBlankRow, applyRowFields, normalize, setAllRows, queueSave, toast, overflowNote]
  );

  // `requireMultiCell` guards the case where a *real* input still has
  // native focus (e.g. the click landed directly on an editable field) -
  // there a plain single-value paste should fall through to the browser's
  // own default paste-into-input behavior instead of being intercepted.
  // The hidden capture field has no such native fallback, so its own paste
  // handler (below) always applies regardless of shape.
  const applyPasteText = useCallback(
    (text: string, anchor: SheetCellPos, requireMultiCell = true) => {
      if (!text) return false;
      if (requireMultiCell && !text.includes("\t") && !text.includes("\n"))
        return false;
      const startRowItem = rows[anchor.row];
      if (!startRowItem) return false;
      const ids = rows.map((r) => r.id);
      const startRow = ids.indexOf(startRowItem.id);
      if (startRow < 0) return false;
      snapshot();
      void runPaste(text, anchor, ids, startRow);
      return true;
    },
    [rows, snapshot, runPaste]
  );

  // Fallback for when a real input/select has native focus - the native
  // `paste` event bubbles up from it to whichever ancestor listens (see
  // DataTableContainer's `onPaste`), covering a drag-selection that started
  // on an editable cell.
  const handlePaste = (e: React.ClipboardEvent) => {
    const text = e.clipboardData.getData("text");
    const anchor = pasteAnchor();
    if (!anchor) return;
    if (applyPasteText(text, anchor)) e.preventDefault();
  };

  // Primary mechanism: the hidden capture field (see hiddenRef/beginCellSelect
  // above) is what's actually focused for any non-input cell selection, so
  // its own copy/paste/keydown handlers - native browser events, no
  // clipboard-read permission needed - are what make Ctrl+C/Ctrl+V reliable
  // there. Render <SheetCaptureField {...captureProps} /> once per grid.
  const isTypingWithSelection = () => {
    const el = document.activeElement as HTMLInputElement | null;
    if (!el || !("selectionStart" in el)) return false;
    return el.selectionStart !== el.selectionEnd;
  };

  const onCaptureCopy = (e: React.ClipboardEvent) => {
    if (!hasSelection) return;
    e.preventDefault();
    e.clipboardData.setData("text/plain", rectsToTsv(allRects));
    toast("Selection copied", "success");
  };

  const onCapturePaste = (e: React.ClipboardEvent) => {
    const anchor = pasteAnchor();
    if (!anchor) return;
    e.preventDefault();
    applyPasteText(e.clipboardData.getData("text"), anchor, false);
  };

  const onCaptureKeyDown = (e: React.KeyboardEvent) => {
    if (
      e.key !== "ArrowUp" &&
      e.key !== "ArrowDown" &&
      e.key !== "ArrowLeft" &&
      e.key !== "ArrowRight"
    )
      return;
    if (!liveFocus && !liveAnchor) return;
    e.preventDefault();
    const from = liveFocus || liveAnchor!;
    let row = from.row;
    let col = from.col;
    if (e.key === "ArrowUp") row -= 1;
    else if (e.key === "ArrowDown") row += 1;
    else if (e.key === "ArrowLeft") col -= 1;
    else col += 1;
    row = Math.max(0, Math.min(rows.length - 1, row));
    col = Math.max(0, Math.min(columns.length - 1, col));
    setRanges([]);
    setLiveAnchor({ row, col });
    setLiveFocus({ row, col });
  };

  const captureProps = {
    ref: hiddenRef,
    onCopy: onCaptureCopy,
    onPaste: onCapturePaste,
    onKeyDown: onCaptureKeyDown,
  };

  // Backstop for Ctrl/Cmd+C when focus is in a real input with no text of
  // its own selected (so its native copy would otherwise grab nothing) -
  // the hidden field's onCopy above already covers every other case.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== "c") return;
      if (document.activeElement === hiddenRef.current) return;
      if (!hasSelection || isTypingWithSelection()) return;
      copySelection();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [hasSelection, copySelection]);

  // Backspace/Delete clears every editable cell in the current selection,
  // mirroring Master P.O Sheet's version.
  const clearSelectedCells = useCallback(() => {
    if (!allRects.length) return;
    const ids = rows.map((r) => r.id);
    let next = [...allRows];
    const touched = new Set<number>();
    for (const rect of allRects) {
      for (let r = rect.r0; r <= rect.r1; r++) {
        const id = ids[r];
        if (id == null) continue;
        const ci = next.findIndex((x) => x.id === id);
        if (ci < 0) continue;
        const row = { ...next[ci] };
        let changed = false;
        for (let c = rect.c0; c <= rect.c1; c++) {
          const colDef = columns[c];
          if (!colDef || !colDef.editable || !colDef.applyText) continue;
          colDef.applyText(row, "");
          changed = true;
        }
        if (changed) {
          next[ci] = row;
          touched.add(id);
        }
      }
    }
    if (!touched.size) return;
    snapshot();
    if (normalize) {
      next = next.map((r) => (touched.has(r.id) ? normalize(r) : r));
    }
    setAllRows(next);
    queueSave();
    toast("Selection cleared", "success");
  }, [allRects, rows, allRows, columns, normalize, setAllRows, queueSave, snapshot, toast]);

  // Same target heuristic as the copy backstop above: only intercept when
  // focus is either inside this grid's own cells or nowhere text-editable
  // at all (the common case right after selecting a whole row/column via
  // its header). Any *other* focused input/textarea/select on the page - a
  // filter, a modal - keeps its normal Backspace/Delete behavior even if a
  // stale selection is still technically active underneath it.
  //
  // A single editable text cell that's actively focused (the normal case
  // while typing a correction into it) is a second exception: let the
  // browser delete one character at a time there instead of wiping the
  // whole value, matching how every other text field on the page behaves.
  // A multi-cell range still bulk-clears on Backspace/Delete regardless of
  // what's focused, since that's the deliberate "select a range, clear it"
  // gesture this shortcut exists for.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Backspace" && e.key !== "Delete") return;
      if (!hasSelection) return;
      const active = document.activeElement as HTMLElement | null;
      const isGridTextInput =
        active !== hiddenRef.current &&
        (active instanceof HTMLInputElement ||
          active instanceof HTMLTextAreaElement) &&
        active.classList.contains("sheet-cell");
      if (isGridTextInput) {
        const isSingleCell = allRects.every(
          (r) => r.r0 === r.r1 && r.c0 === r.c1
        );
        if (allRects.length <= 1 && isSingleCell) return;
      }
      const isForeignInput =
        active &&
        (active instanceof HTMLInputElement ||
          active instanceof HTMLTextAreaElement ||
          active instanceof HTMLSelectElement) &&
        active !== hiddenRef.current &&
        !active.classList.contains("sheet-cell");
      if (isForeignInput) return;
      e.preventDefault();
      clearSelectedCells();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [hasSelection, clearSelectedCells, allRects]);

  // Arrow-key navigation between sheet cells - only kicks in when focus is
  // already inside one of the grid's own inputs/selects (marked with the
  // "sheet-cell" class), mirroring Master Sheet's version.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (
        e.key !== "ArrowUp" &&
        e.key !== "ArrowDown" &&
        e.key !== "ArrowLeft" &&
        e.key !== "ArrowRight"
      )
        return;
      const target = e.target as HTMLElement;
      if (!target.classList?.contains("sheet-cell")) return;
      const td = target.closest("td[data-row][data-col]") as HTMLElement | null;
      if (!td) return;
      const row = Number(td.dataset.row);
      const col = Number(td.dataset.col);
      if (Number.isNaN(row) || Number.isNaN(col)) return;

      if (
        target instanceof HTMLInputElement &&
        (e.key === "ArrowLeft" || e.key === "ArrowRight")
      ) {
        const atStart = target.selectionStart === 0 && target.selectionEnd === 0;
        const atEnd =
          target.selectionStart === target.value.length &&
          target.selectionEnd === target.value.length;
        if (e.key === "ArrowLeft" && !atStart) return;
        if (e.key === "ArrowRight" && !atEnd) return;
      }

      let newRow = row;
      let newCol = col;
      if (e.key === "ArrowUp") newRow -= 1;
      else if (e.key === "ArrowDown") newRow += 1;
      else if (e.key === "ArrowLeft") newCol -= 1;
      else newCol += 1;

      if (newRow < 0 || newRow >= rows.length) return;
      if (newCol < 0 || newCol >= columns.length) return;

      const nextTd = scrollRef.current?.querySelector(
        `td[data-row="${newRow}"][data-col="${newCol}"]`
      ) as HTMLElement | null;
      const focusable = nextTd?.querySelector("input, select") as
        | HTMLInputElement
        | HTMLSelectElement
        | null;
      if (!focusable) return;

      e.preventDefault();
      focusable.focus();
      if (focusable instanceof HTMLInputElement) {
        const pos = focusable.value.length;
        focusable.setSelectionRange(pos, pos);
      }
      setRanges([]);
      setLiveAnchor({ row: newRow, col: newCol });
      setLiveFocus({ row: newRow, col: newCol });
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [rows.length, columns.length]);

  // Deliberately doesn't include `className` (unlike Master Sheet's inline
  // version) - callers here already compute their own td className (color
  // classes, etc.) and would clobber whichever one got spread last. Combine
  // it with `isCellSelected(row, col) && "cell-selected"` yourself instead.
  const cellProps = (row: number, col: number) => ({
    "data-row": row,
    "data-col": col,
    onMouseDown: (e: React.MouseEvent) => beginCellSelect(row, col, e),
    onMouseEnter: () => extendCellSelect(row, col),
  });

  return {
    scrollRef,
    hasSelection,
    isCellSelected,
    cellProps,
    captureProps,
    copySelection,
    handlePaste,
    pasteProgress,
  };
}

// Renders the hidden field a page gets from useSheetGrid's `captureProps` -
// invisible, out of layout and tab order, but a real <textarea> so the
// browser's native copy/paste events fire on it reliably. Render this once
// per grid, anywhere in that page's JSX (position doesn't matter, it's
// visually hidden).
export function SheetCaptureField({
  ref,
  onCopy,
  onPaste,
  onKeyDown,
}: {
  ref: React.RefObject<HTMLTextAreaElement | null>;
  onCopy: (e: React.ClipboardEvent) => void;
  onPaste: (e: React.ClipboardEvent) => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
}) {
  return (
    <textarea
      ref={ref}
      value=""
      readOnly
      aria-hidden="true"
      tabIndex={-1}
      onCopy={onCopy}
      onPaste={onPaste}
      onKeyDown={onKeyDown}
      style={{
        position: "fixed",
        top: -9999,
        left: -9999,
        width: 1,
        height: 1,
        opacity: 0,
        pointerEvents: "none",
      }}
    />
  );
}
