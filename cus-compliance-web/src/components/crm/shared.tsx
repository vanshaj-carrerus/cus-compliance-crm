"use client";

import { useEffect, useState } from "react";
import { badgeClass } from "@/lib/crm";

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
}: {
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: 25 | 50 | 100) => void;
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
