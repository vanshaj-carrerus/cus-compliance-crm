"use client";

import { useEffect, useMemo, useState } from "react";
import { useCrm } from "../CrmProvider";
import {
  money,
  MONTHS,
  defaultDashboardPeriod,
  loadDashboardPeriod,
  saveDashboardPeriod,
  computeDashboardStats,
  type DashboardPeriod,
  type DashboardPeriodMode,
} from "@/lib/crm";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/lib/auth";

function barClass(cls: string) {
  return cls === "success"
    ? "bg-success"
    : cls === "danger"
      ? "bg-danger"
      : cls === "warning"
        ? "bg-warning"
        : cls === "info"
          ? "bg-info"
          : "bg-primary";
}

function Stat({
  label,
  value,
  sub,
  cls = "",
  onClick,
}: {
  label: string;
  value: string | number;
  sub: string;
  cls?: string;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative overflow-hidden rounded-[var(--radius)] border border-border bg-card p-4 text-left shadow-sm sm:p-5 ${
        onClick ? "cursor-pointer hover:border-primary" : "cursor-default"
      }`}
    >
      <div className={`absolute inset-x-0 top-0 h-[3px] ${barClass(cls)}`} />
      <div className="mb-2 text-xs uppercase tracking-wide text-muted">
        {label}
      </div>
      <div className="text-[24px] font-bold leading-none tracking-tight sm:text-[28px]">
        {value}
      </div>
      <div className="mt-1.5 text-xs leading-snug text-success">{sub}</div>
    </button>
  );
}

function FloorFilterStat({
  label,
  value,
  sub,
  cls = "",
  floors,
  floor,
  onFloorChange,
  onClick,
}: {
  label: string;
  value: string | number;
  sub: string;
  cls?: string;
  floors: string[];
  floor: string;
  onFloorChange: (floor: string) => void;
  onClick?: () => void;
}) {
  return (
    <div
      className={`relative overflow-hidden rounded-[var(--radius)] border border-border bg-card p-4 text-left shadow-sm sm:p-5 ${
        onClick ? "cursor-pointer hover:border-primary" : "cursor-default"
      }`}
      onClick={onClick}
      onKeyDown={(e) => {
        if (!onClick) return;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick();
        }
      }}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
    >
      <div className={`absolute inset-x-0 top-0 h-[3px] ${barClass(cls)}`} />
      <div className="mb-2 flex items-start justify-between gap-2">
        <div className="min-w-0 text-xs uppercase tracking-wide text-muted">
          {label}
        </div>
        <select
          value={floor}
          aria-label={`${label} floor`}
          className="max-w-[9.5rem] shrink-0 rounded-md border border-border bg-secondary px-2 py-1 text-[11px] font-semibold text-foreground"
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => {
            e.stopPropagation();
            onFloorChange(e.target.value);
          }}
        >
          <option value="">All floors</option>
          {floors.map((f) => (
            <option key={f} value={f}>
              {f}
            </option>
          ))}
        </select>
      </div>
      <div className="text-[24px] font-bold leading-none tracking-tight sm:text-[28px]">
        {value}
      </div>
      <div className="mt-1.5 text-xs leading-snug text-success">{sub}</div>
    </div>
  );
}

const YEAR_OPTIONS = (() => {
  const y = new Date().getFullYear();
  const years: number[] = [];
  for (let i = y + 1; i >= y - 6; i--) years.push(i);
  return years;
})();

export function Dashboard() {
  const {
    candidates,
    navigate,
    setDailyCategory,
    setActiveFilters,
    setSmartFilter,
  } = useCrm();
  const [displayName, setDisplayName] = useState("");
  const [period, setPeriod] = useState<DashboardPeriod>(defaultDashboardPeriod);
  const [periodReady, setPeriodReady] = useState(false);
  const [runawayFloor, setRunawayFloor] = useState("");

  useEffect(() => {
    setPeriod(loadDashboardPeriod());
    setPeriodReady(true);
  }, []);

  useEffect(() => {
    if (!periodReady) return;
    saveDashboardPeriod(period);
  }, [period, periodReady]);

  const { user } = useAuth();
  useEffect(() => {
    if (user) {
      setDisplayName(user.name || user.email || "");
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const { res, data } = await apiFetch<{
          user?: { name?: string; email?: string };
        }>("/api/auth/me");
        if (!res.ok) return;
        if (!cancelled && data.user) {
          setDisplayName(data.user.name || data.user.email || "");
        }
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  const stats = useMemo(
    () => computeDashboardStats(candidates, period),
    [candidates, period]
  );

  const floors = useMemo(
    () =>
      [
        ...new Set(
          candidates
            .map((c) => String(c.floor || "").trim())
            .filter(Boolean)
        ),
      ].sort((a, b) => a.localeCompare(b)),
    [candidates]
  );

  useEffect(() => {
    if (runawayFloor && !floors.includes(runawayFloor)) {
      setRunawayFloor("");
    }
  }, [floors, runawayFloor]);

  const runawayFloorStat = useMemo(() => {
    if (!runawayFloor) return null;
    return (
      stats.byFloor.find(
        (f) => f.floor.toLowerCase() === runawayFloor.toLowerCase()
      ) ?? null
    );
  }, [stats.byFloor, runawayFloor]);

  const runawayCount = runawayFloor
    ? (runawayFloorStat?.runaway ?? 0)
    : stats.runaway;
  const runawayLossAmount = runawayFloor
    ? (runawayFloorStat?.runawayLoss ?? 0)
    : stats.runawayLoss;
  const runawayFloorLabel = runawayFloor || "All floors";

  const date = new Intl.DateTimeFormat(undefined, {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(new Date());

  const setMode = (mode: DashboardPeriodMode) => {
    setPeriod((p) => {
      if (mode === "month" && (!p.from || !p.to)) {
        const y = p.year;
        const m = p.month;
        const last = new Date(y, m + 1, 0).getDate();
        const pad = (n: number) => String(n).padStart(2, "0");
        return {
          ...p,
          mode,
          from: `${y}-${pad(m + 1)}-01`,
          to: `${y}-${pad(m + 1)}-${pad(last)}`,
        };
      }
      return { ...p, mode };
    });
  };

  const openMaster = (
    filters: {
      status?: string;
      floor?: string;
      assignedTo?: string;
      po?: string;
      poMonth?: string;
    } = {},
    smart?: string
  ) => {
    setActiveFilters(filters);
    setSmartFilter(smart ? { type: smart } : null);
    navigate("master");
  };

  const followLabel = stats.filtered
    ? "Follow-ups in Period"
    : "Follow-ups Due Today";
  const followOverLabel = stats.filtered
    ? "Overdue Follow-ups in Period"
    : "Overdue Follow-ups";
  const collectedSub = stats.filtered
    ? `Collected in ${stats.periodLabel}`
    : stats.pct + "% collection";
  const incentiveSub = stats.filtered
    ? stats.periodLabel
    : "Current 25th cycle";

  return (
    <div className="mx-auto w-full">
      <section className="mb-4 flex flex-col gap-3 rounded-[16px] border border-border bg-card p-4 shadow-sm sm:mb-5 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:gap-4 sm:rounded-[20px] sm:p-5">
        <div className="min-w-0">
          <div className="text-[10px] font-black uppercase tracking-wider text-primary sm:text-xs">
            CareerUS Control Center
          </div>
          <div className="mt-1 text-xl font-black leading-tight text-foreground sm:text-2xl">
            Welcome back{displayName ? `, ${displayName}` : ""}
          </div>
          <div className="mt-1 text-xs text-muted sm:text-sm">
            Your collection pipeline, follow-ups, and compliance performance in
            one clean workspace.
          </div>
        </div>
        <div className="w-fit shrink-0 rounded-full border border-border bg-secondary px-3 py-1.5 text-xs font-bold text-primary sm:text-sm">
          {date}
        </div>
      </section>

      <div className="date-range-bar mb-4 sm:mb-5">
        <label className="period-field">
          Period
          <select
            value={period.mode}
            onChange={(e) => setMode(e.target.value as DashboardPeriodMode)}
          >
            <option value="all">All time</option>
            <option value="month">Month &amp; year</option>
            <option value="range">Custom dates</option>
          </select>
        </label>

        {period.mode === "month" && (
          <>
            <label className="period-field">
              Month
              <select
                value={period.month}
                onChange={(e) =>
                  setPeriod((p) => ({
                    ...p,
                    month: Number(e.target.value),
                  }))
                }
              >
                {MONTHS.map((name, i) => (
                  <option key={name} value={i}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
            <label className="period-field">
              Year
              <select
                value={period.year}
                onChange={(e) =>
                  setPeriod((p) => ({
                    ...p,
                    year: Number(e.target.value),
                  }))
                }
              >
                {YEAR_OPTIONS.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </label>
          </>
        )}

        {period.mode === "range" && (
          <>
            <label className="period-field">
              From date
              <input
                type="date"
                value={period.from}
                onChange={(e) =>
                  setPeriod((p) => ({ ...p, from: e.target.value }))
                }
              />
            </label>
            <label className="period-field">
              To date
              <input
                type="date"
                value={period.to}
                onChange={(e) =>
                  setPeriod((p) => ({ ...p, to: e.target.value }))
                }
              />
            </label>
          </>
        )}

        <div className="flex w-full flex-wrap items-center gap-2 sm:ml-auto sm:w-auto sm:items-end">
          <span className="rounded-full border border-border bg-secondary px-3 py-2 text-xs font-bold text-primary">
            Showing · {stats.periodLabel}
          </span>
          {period.mode !== "all" && (
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => setPeriod(defaultDashboardPeriod())}
            >
              Clear filter
            </button>
          )}
        </div>
      </div>

      <div className="mb-5 grid grid-cols-1 gap-3 sm:mb-6 sm:grid-cols-2 sm:gap-4 xl:grid-cols-3 2xl:grid-cols-4">
        <Stat
          label="Total Candidates"
          value={stats.total}
          sub={stats.filtered ? "Started in period" : "Open Master Sheet"}
          onClick={() => openMaster()}
        />
        <Stat
          label="Active Candidates"
          value={stats.active}
          sub="Remaining balance"
          cls="success"
          onClick={() => openMaster({ status: "Active" })}
        />
        <Stat
          label="Inactive / Completed"
          value={stats.inactive}
          sub="Closed records"
          cls="info"
          onClick={() => openMaster({ status: "Inactive" })}
        />
        <FloorFilterStat
          label="Run Away Candidates"
          value={runawayCount}
          sub={`${runawayFloorLabel} · Status: Run Away`}
          cls="warning"
          floors={floors}
          floor={runawayFloor}
          onFloorChange={setRunawayFloor}
          onClick={() =>
            openMaster({
              status: "Run Away",
              ...(runawayFloor ? { floor: runawayFloor } : {}),
            })
          }
        />
        <FloorFilterStat
          label="Run Away Loss"
          value={money(runawayLossAmount)}
          sub={`${runawayFloorLabel} · Unpaid balance`}
          cls="warning"
          floors={floors}
          floor={runawayFloor}
          onFloorChange={setRunawayFloor}
          onClick={() =>
            openMaster({
              status: "Run Away",
              ...(runawayFloor ? { floor: runawayFloor } : {}),
            })
          }
        />
        <Stat
          label="Total Service Fee"
          value={money(stats.totalFee)}
          sub={stats.filtered ? "Candidates in period" : "All candidates"}
          onClick={() => navigate("reports")}
        />
        <Stat
          label="Total Collected"
          value={money(stats.paid)}
          sub={collectedSub}
          cls="success"
          onClick={() => navigate("reports")}
        />
        <Stat
          label="Total Remaining"
          value={money(stats.remain)}
          sub={stats.filtered ? "Outstanding (period candidates)" : "Outstanding"}
          cls="danger"
          onClick={() => openMaster({ status: "Active" }, "focus")}
        />
        <Stat
          label="Overdue Payments"
          value={stats.overdue}
          sub="Needs follow-up"
          cls="warning"
          onClick={() => {
            setDailyCategory("overdue");
            navigate("daily");
          }}
        />
        <Stat
          label="Yatin Incentive"
          value={money(stats.yatinIncentive)}
          sub={incentiveSub}
          cls="info"
          onClick={() => navigate("incentive")}
        />
        <Stat
          label={followLabel}
          value={stats.followups}
          sub="Open follow-up queue"
          cls="warning"
          onClick={() => {
            setDailyCategory("followupsToday");
            navigate("daily");
          }}
        />
        <Stat
          label={followOverLabel}
          value={stats.followOverdue}
          sub="Open follow-up queue"
          cls="danger"
          onClick={() => {
            setDailyCategory("followupsOverdue");
            navigate("daily");
          }}
        />
        {stats.byFloor.slice(0, 2).map((floor) => (
          <Stat
            key={`floor-paid-${floor.floor}`}
            label={`${floor.floor} Collected`}
            value={money(floor.paid)}
            sub={
              stats.filtered
                ? `Collected in ${stats.periodLabel} · ${money(floor.remain)} remaining`
                : `${floor.count} candidates · ${money(floor.remain)} remaining`
            }
            cls="success"
            onClick={() => {
              setActiveFilters(
                floor.floor === "Unknown" ? {} : { floor: floor.floor }
              );
              setSmartFilter(null);
              navigate("master");
            }}
          />
        ))}
      </div>

      {stats.byFloor.length > 0 && (
        <div className="mb-5 rounded-[var(--radius)] border border-border bg-card p-4 sm:mb-6 sm:p-5">
          <div className="mb-1 text-base font-semibold">Floor-wise Amount</div>
          <div className="mb-3.5 text-xs text-muted">
            Collected and remaining by floor
            {stats.filtered ? ` · ${stats.periodLabel}` : ""}
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {stats.byFloor.map((floor) => (
              <button
                key={floor.floor}
                type="button"
                className="rounded-[var(--radius)] border border-border bg-secondary/40 p-3.5 text-left hover:border-primary"
                onClick={() => {
                  setActiveFilters(
                    floor.floor === "Unknown" ? {} : { floor: floor.floor }
                  );
                  setSmartFilter(null);
                  navigate("master");
                }}
              >
                <div className="mb-2 text-sm font-semibold text-foreground">
                  {floor.floor}
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <div className="text-muted">Collected</div>
                    <div className="mt-0.5 text-sm font-bold text-success">
                      {money(floor.paid)}
                    </div>
                  </div>
                  <div>
                    <div className="text-muted">Remaining</div>
                    <div className="mt-0.5 text-sm font-bold text-danger">
                      {money(floor.remain)}
                    </div>
                  </div>
                </div>
                <div className="mt-2 text-[11px] text-muted">
                  {floor.count} candidates · fee {money(floor.fee)}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="mb-16 rounded-[var(--radius)] border border-border bg-card p-4 sm:mb-6 sm:p-5">
        <div className="mb-3.5 text-base font-semibold">Quick Health Check</div>
        <div className="text-muted">
          Collection Progress · {stats.pct}%
          {stats.filtered ? ` · ${stats.periodLabel}` : ""}
        </div>
        <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-border">
          <div
            className="h-full bg-success transition-all"
            style={{ width: stats.pct + "%" }}
          />
        </div>
        {stats.filtered && (
          <p className="mt-3 text-xs text-muted">
            Candidates &amp; fees use start date (or created date). Collected and
            incentives use payment dates inside the selected period.
          </p>
        )}
      </div>
    </div>
  );
}
