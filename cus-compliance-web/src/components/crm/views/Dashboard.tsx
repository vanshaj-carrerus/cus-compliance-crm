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
  const bar =
    cls === "success"
      ? "bg-success"
      : cls === "danger"
        ? "bg-danger"
        : cls === "warning"
          ? "bg-warning"
          : cls === "info"
            ? "bg-info"
            : "bg-primary";
  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative overflow-hidden rounded-[var(--radius)] border border-border bg-card p-4 text-left shadow-sm sm:p-5 ${
        onClick ? "cursor-pointer hover:border-primary" : "cursor-default"
      }`}
    >
      <div className={`absolute inset-x-0 top-0 h-[3px] ${bar}`} />
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

  useEffect(() => {
    setPeriod(loadDashboardPeriod());
    setPeriodReady(true);
  }, []);

  useEffect(() => {
    if (!periodReady) return;
    saveDashboardPeriod(period);
  }, [period, periodReady]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/auth/me");
        if (!res.ok) return;
        const data = await res.json();
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
  }, []);

  const stats = useMemo(
    () => computeDashboardStats(candidates, period),
    [candidates, period]
  );

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

  const openMaster = (filters: { status?: string } = {}, smart?: string) => {
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
        <Stat
          label="Run Away Candidates"
          value={stats.runaway}
          sub="Status: Run Away"
          cls="warning"
          onClick={() => openMaster({ status: "Run Away" })}
        />
        <Stat
          label="Run Away Loss"
          value={money(stats.runawayLoss)}
          sub="Unpaid balance from run away candidates"
          cls="warning"
          onClick={() => openMaster({ status: "Run Away" })}
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
      </div>

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
