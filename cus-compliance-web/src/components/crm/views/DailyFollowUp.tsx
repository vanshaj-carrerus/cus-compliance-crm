"use client";

import { useEffect, useState } from "react";
import { useCrm } from "../CrmProvider";
import {
  Badge,
  FullscreenButton,
  FullscreenExitFab,
  TableShell,
  useFullscreen,
} from "../shared";
import {
  money,
  getTotalPaid,
  getRemaining,
  fmtDate,
  filteredDaily,
  priorityStats,
  rowColorClass,
  phoneOf,
  cleanPhone,
} from "@/lib/crm";

const CATEGORIES = [
  { key: "overdue", label: "🔴 OVERDUE", cls: "border-danger/40" },
  { key: "today", label: "🔵 TODAY", cls: "border-info/40" },
  { key: "week", label: "🟡 THIS WEEK", cls: "border-warning/40" },
  { key: "upcoming", label: "🟢 UPCOMING", cls: "border-success/40" },
] as const;

export function DailyFollowUp({
  onWhatsApp,
}: {
  onWhatsApp: (id: number | number[], template?: string) => void;
}) {
  const {
    candidates,
    dailyCategory,
    setDailyCategory,
    dailyFilters,
    setDailyFilters,
    dailySelected,
    setDailySelected,
    markContacted,
    updateContactField,
    navigate,
  } = useCrm();

  const title =
    dailyCategory === "followupsToday"
      ? "Follow-ups Due Today"
      : dailyCategory === "followupsOverdue"
        ? "Overdue Follow-ups"
        : (
            {
              overdue: "Overdue Payments",
              today: "Payments Due Today",
              week: "Payments Due This Week",
              upcoming: "Upcoming Payments",
            } as Record<string, string>
          )[dailyCategory] || "Daily Follow-up";

  const rows = filteredDaily(candidates, dailyCategory, dailyFilters);

  const PAGE_SIZE_OPTIONS = [25, 50, 100] as const;
  const [pageSize, setPageSize] = useState<(typeof PAGE_SIZE_OPTIONS)[number]>(50);
  const [page, setPage] = useState(0);
  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize));
  const pageRows = rows.slice(page * pageSize, page * pageSize + pageSize);

  useEffect(() => {
    setPage(0);
  }, [rows.length]);

  useEffect(() => {
    setPage((p) => Math.min(p, pageCount - 1));
  }, [pageCount]);
  const poMonths = [
    ...new Set(candidates.map((c) => c.poMonth).filter(Boolean)),
  ].sort();
  const statuses = [
    ...new Set(candidates.map((c) => c.status).filter(Boolean)),
  ];

  const toggleAll = (checked: boolean) => {
    const next = new Set(dailySelected);
    rows.forEach((r) => {
      const id = String(r.candidate.id);
      if (checked) next.add(id);
      else next.delete(id);
    });
    setDailySelected(next);
  };

  const toggleOne = (id: string, checked: boolean) => {
    const next = new Set(dailySelected);
    if (checked) next.add(id);
    else next.delete(id);
    setDailySelected(next);
  };

  const { fullscreen, toggleFullscreen, shellCls } = useFullscreen();

  return (
    <div className={shellCls}>
      {!fullscreen && (
      <>
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {CATEGORIES.map(({ key, label, cls }) => {
          const stats = priorityStats(candidates, key, dailyFilters);
          return (
            <button
              key={key}
              type="button"
              onClick={() => {
                setDailyCategory(key);
                setDailySelected(new Set());
              }}
              className={`rounded-[20px] border bg-card p-4 text-left shadow-sm transition hover:-translate-y-0.5 ${
                dailyCategory === key
                  ? "border-primary ring-2 ring-primary/20"
                  : cls
              }`}
            >
              <div className="text-[11px] font-black uppercase tracking-wider text-muted">
                {label}
              </div>
              <div className="mt-2 text-3xl font-black">{stats.count}</div>
              <div className="mt-1 text-sm text-muted">
                {money(stats.amount)} collectible
              </div>
            </button>
          );
        })}
      </div>

      <div className="mb-4 grid grid-cols-1 gap-3 rounded-[17px] border border-border bg-card p-3 sm:grid-cols-2 sm:items-end lg:flex lg:flex-wrap">
        <div className="mr-auto min-w-0 sm:col-span-2 lg:col-span-1">
          <div className="text-base font-semibold">Daily Follow-up Queue</div>
          <div className="text-xs text-muted">
            Payments and follow-up commitments in one execution view
          </div>
        </div>
        <label className="flex min-w-0 flex-col gap-1 text-xs text-muted">
          Assigned
          <select
            className="w-full rounded border border-border bg-input px-2 py-1.5 text-sm"
            value={dailyFilters.assignedTo || ""}
            onChange={(e) =>
              setDailyFilters({ ...dailyFilters, assignedTo: e.target.value })
            }
          >
            <option value="">All</option>
            <option>Yatin</option>
            <option>Jayraj</option>
          </select>
        </label>
        <label className="flex min-w-0 flex-col gap-1 text-xs text-muted">
          P.O Month
          <select
            className="w-full rounded border border-border bg-input px-2 py-1.5 text-sm"
            value={dailyFilters.poMonth || ""}
            onChange={(e) =>
              setDailyFilters({ ...dailyFilters, poMonth: e.target.value })
            }
          >
            <option value="">All</option>
            {poMonths.map((v) => (
              <option key={v}>{v}</option>
            ))}
          </select>
        </label>
        <label className="flex min-w-0 flex-col gap-1 text-xs text-muted">
          Status
          <select
            className="w-full rounded border border-border bg-input px-2 py-1.5 text-sm"
            value={dailyFilters.status || ""}
            onChange={(e) =>
              setDailyFilters({ ...dailyFilters, status: e.target.value })
            }
          >
            <option value="">All</option>
            {statuses.map((v) => (
              <option key={v}>{v}</option>
            ))}
          </select>
        </label>
        <button
          type="button"
          className="w-full rounded border border-border bg-secondary px-3 py-2 text-xs font-medium sm:w-auto"
          onClick={() => {
            setDailyCategory("followupsToday");
            setDailySelected(new Set());
          }}
        >
          Today Follow-ups
        </button>
        <button
          type="button"
          className="w-full rounded border border-border bg-secondary px-3 py-2 text-xs font-medium sm:w-auto"
          onClick={() => {
            setDailyCategory("followupsOverdue");
            setDailySelected(new Set());
          }}
        >
          Overdue Follow-ups
        </button>
        <button
          type="button"
          disabled={dailySelected.size === 0}
          className="w-full rounded bg-success px-3 py-2 text-xs font-medium text-white disabled:opacity-50 sm:w-auto"
          onClick={() => {
            onWhatsApp(
              [...dailySelected].map(Number),
              "Payment Reminder"
            );
          }}
        >
          💬 Bulk Reminder ({dailySelected.size})
        </button>
      </div>
      </>
      )}

      <FullscreenExitFab fullscreen={fullscreen} onExit={toggleFullscreen} />
      <TableShell
        title={title}
        subtitle={`${rows.length} candidates prioritized by due date`}
        fullscreen={fullscreen}
        actions={
          <FullscreenButton fullscreen={fullscreen} onToggle={toggleFullscreen} />
        }
      >
        {!fullscreen && (
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-border bg-secondary px-2.5 py-1 text-xs text-muted">
              Showing {pageRows.length} of {rows.length} · Page {page + 1}/{pageCount}
            </span>
            <button
              type="button"
              className="rounded border border-border bg-secondary px-3 py-1.5 text-xs disabled:opacity-50"
              disabled={page <= 0}
              onClick={() => setPage((p) => Math.max(0, p - 1))}
            >
              ◀ Prev
            </button>
            <button
              type="button"
              className="rounded border border-border bg-secondary px-3 py-1.5 text-xs disabled:opacity-50"
              disabled={page >= pageCount - 1}
              onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
            >
              Next ▶
            </button>
            <label className="ml-auto flex items-center gap-1 text-xs text-muted">
              Rows
              <select
                className="rounded border border-border bg-input px-2 py-1 text-xs text-foreground"
                value={pageSize}
                onChange={(e) => {
                  const next = Number(e.target.value) as (typeof PAGE_SIZE_OPTIONS)[number];
                  setPageSize(next);
                  setPage(0);
                }}
              >
                {PAGE_SIZE_OPTIONS.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
          </div>
        )}
        <table className="data-table w-full min-w-[1100px] text-sm">
          <thead>
            <tr>
              <th>
                <input
                  type="checkbox"
                  onChange={(e) => toggleAll(e.target.checked)}
                />
              </th>
              <th>Candidate</th>
              <th>Phone</th>
              <th>P.O Month</th>
              <th>Assigned</th>
              <th>Total Fee</th>
              <th>Paid</th>
              <th>Remaining</th>
              <th>Due Amount</th>
              <th>Due Date</th>
              <th>Days Overdue</th>
              <th>Last Contact</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {(fullscreen ? rows : pageRows).map((r) => {
              const c = r.candidate;
              const id = String(c.id);
              return (
                <tr key={id} className={rowColorClass(c)}>
                  <td>
                    <input
                      type="checkbox"
                      checked={dailySelected.has(id)}
                      onChange={(e) => toggleOne(id, e.target.checked)}
                    />
                  </td>
                  <td>
                    <strong>{c.name || "Unnamed"}</strong>
                    <div className="mt-1 md:hidden">
                      <Badge label={c.status || "Active"} />
                    </div>
                  </td>
                  <td>{phoneOf(c) || "-"}</td>
                  <td>{c.poMonth || "-"}</td>
                  <td>{c.assignedTo || "-"}</td>
                  <td>{money(c.totalServiceFee)}</td>
                  <td className="text-success">{money(getTotalPaid(c))}</td>
                  <td className="text-danger">{money(getRemaining(c))}</td>
                  <td className="text-primary">{money(r.amount)}</td>
                  <td>{fmtDate(r.date)}</td>
                  <td className={r.days ? "font-bold text-danger" : "text-muted"}>
                    {r.days || "-"}
                  </td>
                  <td>
                    <input
                      type="date"
                      className="rounded border border-border bg-input px-1 py-0.5 text-xs"
                      value={c.lastContactDate || ""}
                      onChange={(e) =>
                        updateContactField(c.id, "lastContactDate", e.target.value)
                      }
                    />
                  </td>
                  <td>
                    <div className="flex flex-wrap gap-1">
                      <button
                        type="button"
                        className="rounded bg-success px-2 py-1 text-xs text-white"
                        onClick={() => markContacted(c.id)}
                      >
                        ✓ Contacted
                      </button>
                      <button
                        type="button"
                        className="rounded bg-secondary px-2 py-1 text-xs"
                        onClick={() =>
                          onWhatsApp(
                            c.id,
                            dailyCategory === "overdue"
                              ? "Payment Overdue"
                              : "Payment Reminder"
                          )
                        }
                      >
                        💬
                      </button>
                      <a
                        className="rounded border border-border bg-secondary px-2 py-1 text-xs"
                        href={`tel:${cleanPhone(phoneOf(c))}`}
                      >
                        📞
                      </a>
                      <button
                        type="button"
                        className="rounded border border-border bg-secondary px-2 py-1 text-xs"
                        onClick={() => navigate("master")}
                      >
                        Master
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </TableShell>
    </div>
  );
}
