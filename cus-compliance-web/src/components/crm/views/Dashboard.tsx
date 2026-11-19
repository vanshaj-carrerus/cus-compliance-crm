"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  ArrowRight,
  Building2,
  CalendarClock,
  ChevronRight,
  Footprints,
  Hourglass,
  Import,
  Plus,
  Trophy,
  TrendingDown,
  TriangleAlert,
  UserCheck,
  Users,
  UserX,
  Wallet,
  HandCoins,
  CreditCard,
  Zap,
  ChartColumn,
  Target,
} from "lucide-react";
import { useAuth } from "../AuthProvider";
import { useCrm } from "../CrmProvider";
import {
  money,
  MONTHS,
  todayIso,
  statusExcluded,
  getRemaining,
  defaultDashboardPeriod,
  loadDashboardPeriod,
  saveDashboardPeriod,
  computeDashboardStats,
  type DashboardPeriod,
  type DashboardPeriodMode,
} from "@/lib/crm";

type Tone = "blue" | "green" | "amber" | "red" | "violet" | "cyan";

const ICO = "h-[22px] w-[22px]";

/** Entrance stagger: each block gets its own delay via a CSS variable. */
const delay = (n: number) => ({ "--d": `${n}ms` }) as React.CSSProperties;

function KpiCard({
  label,
  value,
  sub,
  tone = "blue",
  icon,
  index,
  onClick,
  extra,
}: {
  label: string;
  value: string | number;
  sub: string;
  tone?: Tone;
  icon: ReactNode;
  index: number;
  onClick?: () => void;
  extra?: ReactNode;
}) {
  const body = (
    <>
      <span className={`dg-icon dg-tone-${tone}`}>{icon}</span>
      <div className="dg-kpi-main">
        <div className="dg-kpi-top">
          <span className="dg-kpi-label">{label}</span>
          {extra}
        </div>
        <div className="dg-kpi-row">
          <span className="dg-kpi-value">{value}</span>
          <span className={`dg-pill dg-tone-${tone}`} title={sub}>
            {sub}
          </span>
        </div>
      </div>
    </>
  );

  if (!extra) {
    return (
      <button
        type="button"
        onClick={onClick}
        style={delay(index * 55)}
        className={`dg-card dg-kpi dg-in ${onClick ? "is-link" : ""}`}
      >
        {body}
      </button>
    );
  }
  return (
    <div
      style={delay(index * 55)}
      className={`dg-card dg-kpi dg-in ${onClick ? "is-link" : ""}`}
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
      {body}
    </div>
  );
}

/** KPI card with a floor dropdown (floors come from candidate master data). */
function FloorKpiCard({
  label,
  value,
  sub,
  tone,
  icon,
  index,
  floors,
  floor,
  onFloorChange,
  onClick,
}: {
  label: string;
  value: string | number;
  sub: string;
  tone: Tone;
  icon: ReactNode;
  index: number;
  floors: string[];
  floor: string;
  onFloorChange: (floor: string) => void;
  onClick?: () => void;
}) {
  return (
    <KpiCard
      label={label}
      value={value}
      sub={sub}
      tone={tone}
      icon={icon}
      index={index}
      onClick={onClick}
      extra={
        <select
          value={floor}
          aria-label={`${label} floor`}
          className="dg-select"
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
      }
    />
  );
}

const YEAR_OPTIONS = (() => {
  const y = new Date().getFullYear();
  const years: number[] = [];
  for (let i = y + 1; i >= y - 6; i--) years.push(i);
  return years;
})();

const RING_R = 70;
const RING_C = 2 * Math.PI * RING_R;

/** Compact axis labels: $1.2K / $4.5M so they fit the chart gutter. */
function axisMoney(n: number) {
  const a = Math.abs(n);
  if (a >= 1_000_000) return "$" + +(n / 1_000_000).toFixed(1) + "M";
  if (a >= 1_000) return "$" + +(n / 1_000).toFixed(a >= 10_000 ? 0 : 1) + "K";
  return "$" + Math.round(n);
}

function initials(name: string) {
  const p = String(name || "?")
    .trim()
    .split(/\s+/);
  return ((p[0]?.[0] || "?") + (p.length > 1 ? p[p.length - 1][0] : "")).toUpperCase();
}

function greeting(d: Date) {
  const h = d.getHours();
  return h < 12 ? "Good Morning" : h < 17 ? "Good Afternoon" : "Good Evening";
}

function dayDiff(iso: string, today: string) {
  const a = new Date(iso + "T00:00:00").getTime();
  const b = new Date(today + "T00:00:00").getTime();
  return Math.round((a - b) / 86_400_000);
}

export function Dashboard() {
  const { isAdmin, isComplianceAdminRole, canView } = useAuth();
  const showAdminMetrics = isComplianceAdminRole || isAdmin;
  const {
    candidates,
    navigate,
    setDailyCategory,
    setActiveFilters,
    setSmartFilter,
    showAddModal,
    setImportModalOpen,
  } = useCrm();
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

  const stats = useMemo(
    () => computeDashboardStats(candidates, period),
    [candidates, period]
  );

  /** Floors saved on each candidate in the master sheet. */
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

  const now = new Date();
  const date = new Intl.DateTimeFormat(undefined, {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(now);

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

  const openFloor = (floor: string) => {
    setActiveFilters(floor === "Unknown" ? {} : { floor });
    setSmartFilter(null);
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

  /** Next open follow-ups (display only — same data the Follow-up sheet uses). */
  const upcoming = useMemo(() => {
    const today = todayIso();
    return candidates
      .filter((c) => c.nextFollowUpDate && !statusExcluded(c.status))
      .sort((a, b) => a.nextFollowUpDate.localeCompare(b.nextFollowUpDate))
      .slice(0, 5)
      .map((c) => {
        const diff = dayDiff(c.nextFollowUpDate, today);
        const state: { label: string; tone: Tone } =
          diff < 0
            ? { label: "Overdue", tone: "red" }
            : diff === 0
              ? { label: "Due Today", tone: "amber" }
              : diff === 1
                ? { label: "Due Tomorrow", tone: "amber" }
                : { label: "Upcoming", tone: "blue" };
        return {
          id: c.id,
          name: c.name,
          when: new Intl.DateTimeFormat(undefined, {
            month: "short",
            day: "numeric",
          }).format(new Date(c.nextFollowUpDate + "T00:00:00")),
          amount: getRemaining(c),
          state,
        };
      });
  }, [candidates]);

  const chartMax = Math.max(1, ...stats.byFloor.map((f) => f.paid + f.remain));
  const ticks = [1, 0.75, 0.5, 0.25, 0].map((t) => chartMax * t);
  const pct = Math.max(0, Math.min(100, Number(stats.pct) || 0));

  let k = 0;

  return (
    <div className="dg mx-auto w-full">
      {/* ── Greeting ── */}
      <header className="dg-head dg-in" style={delay(0)}>
        <div className="min-w-0">
          <h1 className="dg-title">
            {greeting(now)} <span className="dg-wave">👋</span>
          </h1>
          <p className="dg-sub">Here&apos;s your collection &amp; follow-up overview</p>
        </div>
        <span className="dg-date">{date}</span>
      </header>

      {/* ── Period filter ── */}
      <div className="dg-card dg-period dg-in" style={delay(60)}>
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

        <div className="dg-period-end">
          <span className="dg-pill dg-tone-blue">
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

      {/* ── KPI cards ── */}
      <div className="dg-kpis">
        {showAdminMetrics && (
          <KpiCard
            index={k++}
            label="Total Service Fee"
            value={money(stats.totalFee)}
            sub={stats.filtered ? "Candidates in period" : "All candidates"}
            tone="blue"
            icon={<Wallet className={ICO} strokeWidth={1.8} />}
            onClick={() => navigate("reports")}
          />
        )}
        {showAdminMetrics && (
          <KpiCard
            index={k++}
            label="Total Collected"
            value={money(stats.paid)}
            sub={collectedSub}
            tone="green"
            icon={<HandCoins className={ICO} strokeWidth={1.8} />}
            onClick={() => navigate("reports")}
          />
        )}
        {showAdminMetrics && (
          <KpiCard
            index={k++}
            label="Total Remaining"
            value={money(stats.remain)}
            sub={stats.filtered ? "Outstanding (period)" : "Outstanding"}
            tone="amber"
            icon={<Hourglass className={ICO} strokeWidth={1.8} />}
            onClick={() => openMaster({ status: "Active" }, "focus")}
          />
        )}
        {showAdminMetrics && (
          <KpiCard
            index={k++}
            label="Overdue Payments"
            value={stats.overdue}
            sub="Needs follow-up"
            tone="red"
            icon={<TriangleAlert className={ICO} strokeWidth={1.8} />}
            onClick={() => {
              setDailyCategory("overdue");
              navigate("daily");
            }}
          />
        )}
        <KpiCard
          index={k++}
          label="Total Candidates"
          value={stats.total}
          sub={stats.filtered ? "Started in period" : "Open Master Sheet"}
          tone="blue"
          icon={<Users className={ICO} strokeWidth={1.8} />}
          onClick={() => openMaster()}
        />
        <KpiCard
          index={k++}
          label="Active Candidates"
          value={stats.active}
          sub="Remaining balance"
          tone="green"
          icon={<UserCheck className={ICO} strokeWidth={1.8} />}
          onClick={() => openMaster({ status: "Active" })}
        />
        <KpiCard
          index={k++}
          label="Inactive / Completed"
          value={stats.inactive}
          sub="Closed records"
          tone="cyan"
          icon={<UserX className={ICO} strokeWidth={1.8} />}
          onClick={() => openMaster({ status: "Inactive" })}
        />
        <FloorKpiCard
          index={k++}
          label="Run Away Candidates"
          value={runawayCount}
          sub={`${runawayFloorLabel} · Run Away`}
          tone="amber"
          icon={<Footprints className={ICO} strokeWidth={1.8} />}
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
        {showAdminMetrics && (
          <FloorKpiCard
            index={k++}
            label="Run Away Loss"
            value={money(runawayLossAmount)}
            sub={`${runawayFloorLabel} · Unpaid`}
            tone="red"
            icon={<TrendingDown className={ICO} strokeWidth={1.8} />}
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
        )}
        {canView("incentive") && (
          <KpiCard
            index={k++}
            label="Yatin Incentive"
            value={money(stats.yatinIncentive)}
            sub={incentiveSub}
            tone="violet"
            icon={<Trophy className={ICO} strokeWidth={1.8} />}
            onClick={() => navigate("incentive")}
          />
        )}
        <KpiCard
          index={k++}
          label={followLabel}
          value={stats.followups}
          sub="Open follow-up queue"
          tone="amber"
          icon={<CalendarClock className={ICO} strokeWidth={1.8} />}
          onClick={() => {
            setDailyCategory("followupsToday");
            navigate("daily");
          }}
        />
        <KpiCard
          index={k++}
          label={followOverLabel}
          value={stats.followOverdue}
          sub="Open follow-up queue"
          tone="red"
          icon={<TriangleAlert className={ICO} strokeWidth={1.8} />}
          onClick={() => {
            setDailyCategory("followupsOverdue");
            navigate("daily");
          }}
        />
        {stats.byFloor.slice(0, 2).map((floor) => (
          <KpiCard
            index={k++}
            key={`floor-paid-${floor.floor}`}
            label={`${floor.floor} Collected`}
            value={money(floor.paid)}
            sub={
              stats.filtered
                ? `${money(floor.remain)} remaining`
                : `${floor.count} candidates · ${money(floor.remain)} left`
            }
            tone="green"
            icon={<Building2 className={ICO} strokeWidth={1.8} />}
            onClick={() => openFloor(floor.floor)}
          />
        ))}
      </div>

      {/* ── Charts / progress / follow-ups / table / quick actions ── */}
      <div className="dg-board">
        {/* Floor-wise bars */}
        {stats.byFloor.length > 0 && (
          <section className="dg-card dg-chart dg-in" style={delay(420)}>
            <div className="dg-card-head">
              <span className="dg-card-icon">
                <ChartColumn className="h-[18px] w-[18px]" strokeWidth={2} />
              </span>
              <h2 className="dg-card-title">Floor-wise Amount</h2>
              <span className="dg-chip">
                {stats.filtered ? stats.periodLabel : "Collected"}
              </span>
            </div>
            <div className="dg-plot">
              <div className="dg-yaxis" aria-hidden>
                {ticks.map((t, i) => (
                  <span key={i}>{axisMoney(t)}</span>
                ))}
              </div>
              <div className="dg-bars-wrap">
                <div className="dg-grid-lines" aria-hidden>
                  {ticks.map((_, i) => (
                    <i key={i} />
                  ))}
                </div>
                <div className="dg-bars">
                  {stats.byFloor.map((f, i) => (
                    <button
                      key={f.floor}
                      type="button"
                      className="dg-bar-col"
                      onClick={() => openFloor(f.floor)}
                      title={`${f.floor} — Collected ${money(f.paid)} · Remaining ${money(f.remain)} · ${f.count} candidates`}
                    >
                      <span className="dg-bar-track">
                        <span
                          className="dg-bar"
                          style={{
                            height: `${Math.max(3, (f.paid / chartMax) * 100)}%`,
                            animationDelay: `${520 + i * 70}ms`,
                          }}
                        />
                        <span
                          className="dg-bar is-remain"
                          style={{
                            height: `${(f.remain / chartMax) * 100}%`,
                            animationDelay: `${600 + i * 70}ms`,
                          }}
                        />
                      </span>
                      <span className="dg-bar-label">{f.floor}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className="dg-legend">
              <span>
                <i className="is-paid" /> Collected
              </span>
              <span>
                <i className="is-remain" /> Remaining
              </span>
            </div>
          </section>
        )}

        {/* Collection progress ring */}
        <section className="dg-card dg-progress dg-in" style={delay(480)}>
          <div className="dg-card-head">
            <span className="dg-card-icon">
              <Target className="h-[18px] w-[18px]" strokeWidth={2} />
            </span>
            <h2 className="dg-card-title">Collection Progress</h2>
          </div>
          <div className="dg-progress-body">
            <div className="dg-ring">
              <svg viewBox="0 0 180 180" aria-hidden>
                <defs>
                  <linearGradient id="dgRing" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" stopColor="#ffffff" />
                    <stop offset="55%" stopColor="#f2f5ff" />
                    <stop offset="100%" stopColor="#d6defa" />
                  </linearGradient>
                </defs>
                <circle className="dg-ring-track" cx="90" cy="90" r={RING_R} />
                <circle
                  className="dg-ring-fill"
                  cx="90"
                  cy="90"
                  r={RING_R}
                  stroke="url(#dgRing)"
                  strokeDasharray={RING_C}
                  strokeDashoffset={RING_C * (1 - pct / 100)}
                  style={{ ["--ring-c" as string]: RING_C }}
                  transform="rotate(-90 90 90)"
                />
              </svg>
              <div className="dg-ring-center">
                <strong>{pct}%</strong>
                <span>Collected</span>
              </div>
            </div>
            <div className="dg-progress-stats">
              {showAdminMetrics ? (
                <>
                  <div className="dg-pstat">
                    <span className="dg-pstat-ico dg-tone-green">
                      <HandCoins className="h-4 w-4" strokeWidth={2} />
                    </span>
                    <div>
                      <b>{money(stats.paid)}</b>
                      <small>Collected</small>
                    </div>
                  </div>
                  <div className="dg-pstat">
                    <span className="dg-pstat-ico dg-tone-blue">
                      <Wallet className="h-4 w-4" strokeWidth={2} />
                    </span>
                    <div>
                      <b>{money(stats.totalFee)}</b>
                      <small>Service fee</small>
                    </div>
                  </div>
                </>
              ) : (
                <div className="dg-pstat-note">
                  {stats.filtered ? stats.periodLabel : "All time"}
                </div>
              )}
            </div>
          </div>
          {stats.filtered && (
            <p className="dg-foot">
              Candidates &amp; fees use start date (or created date). Collected
              and incentives use payment dates inside the period.
            </p>
          )}
        </section>

        {/* Today's follow-ups */}
        <section className="dg-card dg-follow dg-in" style={delay(540)}>
          <div className="dg-card-head">
            <span className="dg-card-icon">
              <CalendarClock className="h-[18px] w-[18px]" strokeWidth={2} />
            </span>
            <h2 className="dg-card-title">
              {stats.filtered ? "Follow-Ups" : "Today’s Follow-Ups"}
            </h2>
            <span className="dg-count">{stats.followups + stats.followOverdue}</span>
          </div>
          <ul className="dg-follow-list">
            <li>
              <button
                type="button"
                onClick={() => {
                  setDailyCategory("followupsOverdue");
                  navigate("daily");
                }}
              >
                <i className="dg-dot dg-tone-red" />
                <span>{followOverLabel}</span>
                <b className="dg-num dg-tone-red">{stats.followOverdue}</b>
              </button>
            </li>
            <li>
              <button
                type="button"
                onClick={() => {
                  setDailyCategory("followupsToday");
                  navigate("daily");
                }}
              >
                <i className="dg-dot dg-tone-amber" />
                <span>{followLabel}</span>
                <b className="dg-num dg-tone-amber">{stats.followups}</b>
              </button>
            </li>
            {showAdminMetrics && (
              <li>
                <button
                  type="button"
                  onClick={() => {
                    setDailyCategory("overdue");
                    navigate("daily");
                  }}
                >
                  <i className="dg-dot dg-tone-blue" />
                  <span>Overdue Payments</span>
                  <b className="dg-num dg-tone-blue">{stats.overdue}</b>
                </button>
              </li>
            )}
          </ul>
          <button
            type="button"
            className="dg-cta"
            onClick={() => {
              setDailyCategory("followupsToday");
              navigate("daily");
            }}
          >
            View Follow-Ups <ArrowRight className="h-4 w-4" strokeWidth={2.2} />
          </button>
        </section>

        {/* Upcoming follow-ups table */}
        <section className="dg-card dg-upcoming dg-in" style={delay(600)}>
          <div className="dg-card-head">
            <span className="dg-card-icon">
              <CalendarClock className="h-[18px] w-[18px]" strokeWidth={2} />
            </span>
            <h2 className="dg-card-title">
              Upcoming Follow-Ups <small>(Next in queue)</small>
            </h2>
          </div>
          <div className="dg-table" role="table">
            <div className="dg-tr dg-th" role="row">
              <span role="columnheader">Candidate</span>
              <span role="columnheader">Next Due</span>
              <span role="columnheader">Balance</span>
              <span role="columnheader">Status</span>
              <span />
            </div>
            {upcoming.length === 0 && (
              <div className="dg-empty">No open follow-ups scheduled.</div>
            )}
            {upcoming.map((u, i) => (
              <button
                key={u.id}
                type="button"
                role="row"
                className="dg-tr dg-row"
                style={{ animationDelay: `${700 + i * 60}ms` }}
                onClick={() => {
                  setDailyCategory(
                    u.state.label === "Overdue"
                      ? "followupsOverdue"
                      : "followupsToday"
                  );
                  navigate("daily");
                }}
              >
                <span className="dg-who">
                  <i className="dg-avatar">{initials(u.name)}</i>
                  <em>{u.name}</em>
                </span>
                <span>{u.when}</span>
                <span>{money(u.amount)}</span>
                <span>
                  <b className={`dg-badge dg-tone-${u.state.tone}`}>
                    {u.state.label}
                  </b>
                </span>
                <ChevronRight className="dg-chev h-4 w-4" />
              </button>
            ))}
          </div>
        </section>

        {/* Quick actions */}
        <section className="dg-card dg-quick dg-in" style={delay(660)}>
          <div className="dg-card-head">
            <span className="dg-card-icon">
              <Zap className="h-[18px] w-[18px]" strokeWidth={2} />
            </span>
            <h2 className="dg-card-title">Quick Actions</h2>
          </div>
          <div className="dg-quick-grid">
            <button type="button" className="dg-tile" onClick={showAddModal}>
              <span className="dg-tile-ico dg-tone-blue">
                <Plus className="h-6 w-6" strokeWidth={2.4} />
              </span>
              Add Candidate
            </button>
            {canView("history") && (
              <button
                type="button"
                className="dg-tile"
                onClick={() => navigate("history")}
              >
                <span className="dg-tile-ico dg-tone-violet">
                  <CreditCard className="h-6 w-6" strokeWidth={2} />
                </span>
                Payment History
              </button>
            )}
            <button
              type="button"
              className="dg-tile"
              onClick={() => {
                setDailyCategory("followupsToday");
                navigate("daily");
              }}
            >
              <span className="dg-tile-ico dg-tone-cyan">
                <CalendarClock className="h-6 w-6" strokeWidth={2} />
              </span>
              Follow-Ups
            </button>
            <button
              type="button"
              className="dg-tile"
              onClick={() => setImportModalOpen(true)}
            >
              <span className="dg-tile-ico dg-tone-green">
                <Import className="h-6 w-6" strokeWidth={2} />
              </span>
              Import
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}
