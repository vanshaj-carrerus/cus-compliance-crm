import type { ActiveFilters, Candidate } from "./types";
import { diffDays, todayIso } from "./dates";
import {
  addOneMonthIso,
  getRemaining,
  nextUnpaid,
  paymentDateFor,
  statusExcluded,
} from "./calc";

export interface DailyRow {
  candidate: Candidate;
  amount: number;
  date: string;
  idx: number;
  days: number;
  followup: boolean;
}

/**
 * When is this candidate's next payment expected? Read-only - nothing is
 * written back to the candidate.
 *  1. An unpaid installment that already has a date + amount: that date.
 *  2. Otherwise assume the candidate pays again the next month, one day
 *     later than their latest paid installment (paid 27 Aug 2026 -> due
 *     28 Sep 2026), for as long as they still owe a balance.
 */
export function expectedPayment(
  c: Candidate
): { date: string; amount: number; idx: number } | null {
  const scheduled = (c.installments || [])
    .map((inst, idx) => ({ inst, idx }))
    .filter(
      (x) =>
        x.inst && !x.inst.paid && (Number(x.inst.amount) || 0) > 0 && x.inst.date
    )
    .sort((a, b) => String(a.inst.date).localeCompare(String(b.inst.date)))[0];
  if (scheduled) {
    return {
      date: scheduled.inst.date,
      amount: Number(scheduled.inst.amount) || 0,
      idx: scheduled.idx,
    };
  }

  const remaining = getRemaining(c);
  if (remaining <= 0) return null; // fully paid, or no total fee to chase

  let last = "";
  for (const inst of c.installments || []) {
    if (!inst || !inst.paid || !((Number(inst.amount) || 0) > 0)) continue;
    const d = paymentDateFor(inst);
    if (d && d > last) last = d;
  }
  if (!last) return null;
  const month = addOneMonthIso(last);
  if (!month) return null;
  const emptySlot = (c.installments || []).findIndex(
    (i) => i && !i.paid && !(Number(i.amount) || 0) && !i.date
  );
  return { date: month, amount: remaining, idx: emptySlot };
}

export function dailyEntry(
  c: Candidate,
  category: string,
  t = todayIso()
): DailyRow | null {
  // The Follow-up page list: every candidate who still owes money, whatever
  // their status or installment layout. Nothing else decides membership.
  // The date is only informational (the assumed next payable date).
  if (category === "all") {
    const left = getRemaining(c);
    if (left <= 0) return null;
    const due = expectedPayment(c);
    return {
      candidate: c,
      amount: left,
      date: due?.date ?? "",
      idx: due?.idx ?? -1,
      days: due ? Math.max(0, -diffDays(due.date, t)) : 0,
      followup: false,
    };
  }

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

  const due = expectedPayment(c);
  if (!due) return null;
  const dayDiff = diffDays(due.date, t);
  const inCategory =
    category === "overdue"
      ? dayDiff < 0
      : category === "today"
        ? dayDiff === 0
        : category === "week"
          ? dayDiff >= 1 && dayDiff <= 7
          : category === "upcoming"
            ? dayDiff >= 8 && dayDiff <= 30
            : false;
  if (!inCategory) return null;
  return {
    candidate: c,
    amount: due.amount,
    date: due.date,
    idx: due.idx,
    days: Math.max(0, -dayDiff),
    followup: false,
  };
}

export function filteredDaily(
  candidates: Candidate[],
  category: string,
  filters: ActiveFilters = {}
): DailyRow[] {
  return candidates
    .filter((c) => category === "all" || !statusExcluded(c.status))
    .filter(
      (c) =>
        !filters.assignedTo ||
        String(c.assignedTo || "").trim().toLowerCase() ===
          String(filters.assignedTo).trim().toLowerCase()
    )
    .filter((c) => !filters.poMonth || c.poMonth === filters.poMonth)
    .filter(
      (c) =>
        !filters.status ||
        (filters.status === "Active"
          ? !c.status || c.status === "Active" // blank status displays as "Active"
          : c.status === filters.status)
    )
    .map((c) => dailyEntry(c, category))
    .filter((x): x is DailyRow => !!x)
    .sort(
      (a, b) =>
        // rows with no known date go last
        (a.date ? 0 : 1) - (b.date ? 0 : 1) ||
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
