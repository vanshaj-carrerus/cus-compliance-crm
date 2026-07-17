import type { Candidate } from "./types";
import {
  getComplianceStatus,
  getRemaining,
  getTotalPaid,
  paymentDateFor,
  statusExcluded,
} from "./calc";
import { incentiveByAssignee } from "./incentive";
import { todayIso, validDateString, currentCycleStart, addDaysDate } from "./dates";

export type DashboardPeriodMode = "all" | "month" | "range";

export type DashboardPeriod = {
  mode: DashboardPeriodMode;
  year: number;
  month: number; // 0–11
  from: string;
  to: string;
};

export function defaultDashboardPeriod(): DashboardPeriod {
  const now = new Date();
  return {
    mode: "all",
    year: now.getFullYear(),
    month: now.getMonth(),
    from: "",
    to: "",
  };
}

const PERIOD_STORAGE_KEY = "crm-dashboard-period";

export function loadDashboardPeriod(): DashboardPeriod {
  const fallback = defaultDashboardPeriod();
  if (typeof window === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(PERIOD_STORAGE_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Partial<DashboardPeriod>;
    const mode =
      parsed.mode === "month" || parsed.mode === "range" || parsed.mode === "all"
        ? parsed.mode
        : "all";
    const year =
      typeof parsed.year === "number" && Number.isFinite(parsed.year)
        ? parsed.year
        : fallback.year;
    const month =
      typeof parsed.month === "number" &&
      parsed.month >= 0 &&
      parsed.month <= 11
        ? parsed.month
        : fallback.month;
    const from = typeof parsed.from === "string" ? parsed.from : "";
    const to = typeof parsed.to === "string" ? parsed.to : "";
    return { mode, year, month, from, to };
  } catch {
    return fallback;
  }
}

export function saveDashboardPeriod(period: DashboardPeriod) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(PERIOD_STORAGE_KEY, JSON.stringify(period));
  } catch {
    /* ignore quota / private mode */
  }
}

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

/** Inclusive ISO date bounds, or null when showing all-time. */
export function resolveDashboardBounds(
  period: DashboardPeriod
): { from: string; to: string } | null {
  if (period.mode === "all") return null;

  if (period.mode === "month") {
    const y = period.year;
    const m = period.month;
    const last = new Date(y, m + 1, 0).getDate();
    return {
      from: `${y}-${pad2(m + 1)}-01`,
      to: `${y}-${pad2(m + 1)}-${pad2(last)}`,
    };
  }

  const from = validDateString(period.from);
  const to = validDateString(period.to);
  if (!from || !to) return null;
  return from <= to ? { from, to } : { from: to, to: from };
}

export function candidateAnchorDate(c: Candidate): string {
  return (
    validDateString(c.startDate) ||
    String(c.createdAt || "").slice(0, 10) ||
    ""
  );
}

function isoInRange(iso: string, from: string, to: string) {
  return Boolean(iso) && iso >= from && iso <= to;
}

export function getPaidInRange(
  c: Candidate,
  from: string,
  to: string
): number {
  return (c.installments || []).reduce((s, i) => {
    if (!i?.paid) return s;
    const d = paymentDateFor(i);
    if (!isoInRange(d, from, to)) return s;
    return s + (Number(i.amount) || 0);
  }, 0);
}

export interface DashboardStats {
  total: number;
  active: number;
  inactive: number;
  runaway: number;
  totalFee: number;
  paid: number;
  remain: number;
  overdue: number;
  yatinIncentive: number;
  jayrajIncentive: number;
  followups: number;
  followOverdue: number;
  pct: number;
  periodLabel: string;
  filtered: boolean;
}

export function computeDashboardStats(
  candidates: Candidate[],
  period: DashboardPeriod
): DashboardStats {
  const bounds = resolveDashboardBounds(period);
  const filtered = Boolean(bounds);

  const scoped = bounds
    ? candidates.filter((c) =>
        isoInRange(candidateAnchorDate(c), bounds.from, bounds.to)
      )
    : candidates;

  const total = scoped.length;
  const active = scoped.filter(
    (x) => x.status === "Active" && getRemaining(x) > 0
  ).length;
  const inactive = scoped.filter(
    (x) => x.status === "Inactive" || getRemaining(x) <= 0
  ).length;
  const runaway = scoped.filter((x) => x.status === "Run Away").length;
  const totalFee = scoped.reduce((s, x) => s + (Number(x.totalServiceFee) || 0), 0);

  const paid = bounds
    ? candidates.reduce((s, c) => s + getPaidInRange(c, bounds.from, bounds.to), 0)
    : candidates.reduce((s, x) => s + getTotalPaid(x), 0);

  const remain = bounds
    ? scoped.reduce((s, x) => s + getRemaining(x), 0)
    : Math.max(0, totalFee - paid);

  const overdue = scoped.filter(
    (x) => getComplianceStatus(x) === "Overdue"
  ).length;

  let yatinIncentive = 0;
  let jayrajIncentive = 0;
  if (bounds) {
    const start = new Date(bounds.from + "T00:00:00");
    const end = new Date(bounds.to + "T00:00:00");
    const cy = incentiveByAssignee(candidates, start, end);
    yatinIncentive = cy.Yatin;
    jayrajIncentive = cy.Jayraj;
  } else {
    const start = currentCycleStart();
    const end = addDaysDate(start, 31);
    const cy = incentiveByAssignee(candidates, start, end);
    yatinIncentive = cy.Yatin;
    jayrajIncentive = cy.Jayraj;
  }

  const t = todayIso();
  let followups: number;
  let followOverdue: number;

  if (bounds) {
    followups = candidates.filter(
      (c) =>
        c.nextFollowUpDate &&
        isoInRange(c.nextFollowUpDate, bounds.from, bounds.to) &&
        !statusExcluded(c.status)
    ).length;
    followOverdue = candidates.filter(
      (c) =>
        c.nextFollowUpDate &&
        c.nextFollowUpDate < t &&
        isoInRange(c.nextFollowUpDate, bounds.from, bounds.to) &&
        !statusExcluded(c.status)
    ).length;
  } else {
    followups = candidates.filter(
      (c) => c.nextFollowUpDate === t && !statusExcluded(c.status)
    ).length;
    followOverdue = candidates.filter(
      (c) =>
        c.nextFollowUpDate &&
        c.nextFollowUpDate < t &&
        !statusExcluded(c.status)
    ).length;
  }

  const pct = totalFee
    ? Math.min(100, Math.round((paid / totalFee) * 100))
    : paid > 0
      ? 100
      : 0;

  let periodLabel = "All time";
  if (bounds) {
    if (period.mode === "month") {
      const name = new Date(period.year, period.month, 1).toLocaleString(
        undefined,
        { month: "long", year: "numeric" }
      );
      periodLabel = name;
    } else {
      periodLabel = `${bounds.from} → ${bounds.to}`;
    }
  }

  return {
    total,
    active,
    inactive,
    runaway,
    totalFee,
    paid,
    remain,
    overdue,
    yatinIncentive,
    jayrajIncentive,
    followups,
    followOverdue,
    pct,
    periodLabel,
    filtered,
  };
}
