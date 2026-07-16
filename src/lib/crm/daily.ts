import type { ActiveFilters, Candidate } from "./types";
import { diffDays, todayIso } from "./dates";
import { nextUnpaid, statusExcluded } from "./calc";

export interface DailyRow {
  candidate: Candidate;
  amount: number;
  date: string;
  idx: number;
  days: number;
  followup: boolean;
}

export function dailyEntry(
  c: Candidate,
  category: string,
  t = todayIso()
): DailyRow | null {
  if (category === "followupsToday" || category === "followupsOverdue") {
    const d = c.nextFollowUpDate || "";
    if (!d) return null;
    if (category === "followupsToday" && d !== t) return null;
    if (category === "followupsOverdue" && d >= t) return null;
    const n = nextUnpaid(c);
    return {
      candidate: c,
      amount: n ? Number(n.inst.amount) || 0 : 0,
      date: d,
      idx: n ? n.idx : -1,
      days: Math.max(0, -diffDays(d, t)),
      followup: true,
    };
  }

  const matches = (c.installments || [])
    .map((inst, idx) => ({ inst, idx }))
    .filter(
      (x) =>
        x.inst &&
        !x.inst.paid &&
        (Number(x.inst.amount) || 0) > 0 &&
        x.inst.date
    )
    .filter((x) => {
      const dayDiff = diffDays(x.inst.date, t);
      if (category === "overdue") return dayDiff < 0;
      if (category === "today") return dayDiff === 0;
      if (category === "week") return dayDiff >= 1 && dayDiff <= 7;
      if (category === "upcoming") return dayDiff >= 8 && dayDiff <= 30;
      return false;
    })
    .sort((a, b) => String(a.inst.date).localeCompare(String(b.inst.date)));

  if (!matches.length) return null;
  const x = matches[0];
  return {
    candidate: c,
    amount: Number(x.inst.amount) || 0,
    date: x.inst.date,
    idx: x.idx,
    days: Math.max(0, -diffDays(x.inst.date, t)),
    followup: false,
  };
}

export function filteredDaily(
  candidates: Candidate[],
  category: string,
  filters: ActiveFilters = {}
): DailyRow[] {
  return candidates
    .filter((c) => !statusExcluded(c.status))
    .filter((c) => !filters.assignedTo || c.assignedTo === filters.assignedTo)
    .filter((c) => !filters.poMonth || c.poMonth === filters.poMonth)
    .filter((c) => !filters.status || c.status === filters.status)
    .map((c) => dailyEntry(c, category))
    .filter((x): x is DailyRow => !!x)
    .sort(
      (a, b) =>
        String(a.date).localeCompare(String(b.date)) ||
        String(a.candidate.name).localeCompare(String(b.candidate.name))
    );
}

export function priorityStats(
  candidates: Candidate[],
  category: string,
  filters: ActiveFilters = {}
) {
  const rows = filteredDaily(candidates, category, filters);
  return {
    rows,
    count: rows.length,
    amount: rows.reduce((s, r) => s + r.amount, 0),
  };
}
