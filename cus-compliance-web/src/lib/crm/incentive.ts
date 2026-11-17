import type { Candidate, ActiveFilters } from "./types";
import { getRemaining, paymentDateFor } from "./calc";

export interface IncentiveRow {
  assignedTo: string;
  candidateName: string;
  date: string;
  amount: number;
  incentive: number;
  floor: string;
  notes: string;
}

const EXCLUDED = new Set([
  "cancelled",
  "refunded",
  "closed",
  "run away",
  "lost job",
  "job lost",
  "inactive",
]);

export function isIncentiveEligible(c: Candidate): boolean {
  const st = String(c.status || "").toLowerCase();
  if (EXCLUDED.has(st)) return false;
  // Active-only rule from v3.12: include Active and Fully Paid with payments
  if (st === "active" || st === "fully paid" || getRemaining(c) > 0) return true;
  return st === "active";
}

export function filterCandidates(
  list: Candidate[],
  searchQuery: string,
  activeFilters: ActiveFilters,
  sortColumn?: string | null,
  sortDir: "asc" | "desc" = "asc"
): Candidate[] {
  let r = [...list];
  const q = searchQuery.toLowerCase().trim();
  if (activeFilters.floor) r = r.filter((c) => c.floor === activeFilters.floor);
  if (activeFilters.status)
    r = r.filter((c) => c.status === activeFilters.status);
  if (activeFilters.po) r = r.filter((c) => c.po === activeFilters.po);
  if (activeFilters.assignedTo)
    r = r.filter((c) => c.assignedTo === activeFilters.assignedTo);
  if (activeFilters.poMonth)
    r = r.filter((c) => c.poMonth === activeFilters.poMonth);
  if (q) {
    r = r.filter((c) =>
      [
        c.name,
        c.po,
        c.floor,
        c.status,
        c.assignedTo,
        c.remarks,
        c.poMonth,
        c.phoneNumber,
      ].some((x) => String(x || "").toLowerCase().includes(q))
    );
  }
  if (sortColumn) {
    r.sort((a, b) => {
      let av = (a as unknown as Record<string, unknown>)[sortColumn];
      let bv = (b as unknown as Record<string, unknown>)[sortColumn];
      if (typeof av === "string") av = av.toLowerCase();
      if (typeof bv === "string") bv = bv.toLowerCase();
      if ((av as string | number) < (bv as string | number))
        return sortDir === "asc" ? -1 : 1;
      if ((av as string | number) > (bv as string | number))
        return sortDir === "asc" ? 1 : -1;
      return 0;
    });
  }
  return r;
}

const sameName = (a: string, b: string) =>
  String(a || "").trim().toLowerCase() === String(b || "").trim().toLowerCase();

/**
 * Every paid installment whose payment date falls in [start, end], for ALL
 * assignees (or just `assignee` when given). The payment belongs to whoever
 * the candidate is assigned to. Names match ignoring case/spaces.
 */
export function incentivePayments(
  candidates: Candidate[],
  start: Date,
  end: Date,
  opts: { assignee?: string } = {}
): IncentiveRow[] {
  const endBound = new Date(end);
  endBound.setHours(23, 59, 59, 999);
  const rows: IncentiveRow[] = [];
  candidates.forEach((c) => {
    if (!String(c.assignedTo || "").trim()) return;
    if (opts.assignee && !sameName(c.assignedTo, opts.assignee)) return;
    if (!isIncentiveEligible(c)) return;
    (c.installments || []).forEach((i, idx) => {
      if (!i || !i.paid) return;
      const date = paymentDateFor(i);
      if (!date) return;
      const d = new Date(date + "T00:00:00");
      if (!(d >= start && d <= endBound)) return;
      const amount = Number(i.amount) || 0;
      if (amount <= 0) return;
      rows.push({
        assignedTo: c.assignedTo,
        candidateName: c.name,
        date,
        amount,
        incentive: amount / 2,
        floor: c.floor,
        notes: i.notes || "Installment " + (idx + 1),
      });
    });
  });
  return rows.sort(
    (a, b) =>
      new Date(a.date).getTime() - new Date(b.date).getTime() ||
      a.assignedTo.localeCompare(b.assignedTo)
  );
}

/** Yatin's rows only (dashboard incentive card). */
export function incentiveRows(
  candidates: Candidate[],
  start: Date,
  end: Date,
  searchQuery = "",
  activeFilters: ActiveFilters = {}
): IncentiveRow[] {
  return incentivePayments(
    filterCandidates(candidates, searchQuery, activeFilters),
    start,
    end,
    { assignee: "Yatin" }
  );
}

export function calculateYatinIncentive(
  candidates: Candidate[],
  start: Date,
  end: Date
): number {
  return incentiveRows(candidates, start, end).reduce(
    (total, row) => total + row.incentive,
    0
  );
}

/** Director incentive: half of payments, shown in rupees for display */
export function directorIncentive(amount: number): number {
  return amount / 2;
}
