import type { Candidate, Installment } from "./types";
import { validDateString } from "./dates";

export function round(n: number): number {
  return Math.round((Number(n) || 0) * 100) / 100;
}

export function money(n: number): string {
  return (
    "$" +
    round(n).toLocaleString("en-US", { maximumFractionDigits: 2 })
  );
}

export function rupee(v: number): string {
  const n = Number(v) || 0;
  return "₹" + Math.round(n).toLocaleString("en-IN");
}

export function parseMoney(v: unknown): number {
  const m = String(v ?? "")
    .replace(/,/g, "")
    .match(/-?\d+(?:\.\d+)?/);
  return m ? Number(m[0]) : 0;
}

export function parsePercent(v: unknown): number {
  const m = String(v ?? "")
    .replace(/,/g, "")
    .match(/(\d+(?:\.\d+)?)\s*%/);
  return m ? Number(m[1]) : 0;
}

export function paymentDateFor(inst?: Installment | null): string {
  return validDateString(inst?.paymentDate) || validDateString(inst?.date) || "";
}

export function getTotalPaid(c: Candidate): number {
  return (c.installments || []).reduce(
    (s, i) => s + (i.paid ? Number(i.amount) || 0 : 0),
    0
  );
}

export function getRemaining(c: Candidate): number {
  return Math.max(0, (Number(c.totalServiceFee) || 0) - getTotalPaid(c));
}

export function getLastPaymentDate(c: Candidate): string {
  const installments = c.installments || [];
  for (let idx = installments.length - 1; idx >= 0; idx--) {
    const i = installments[idx];
    if (i && i.paid && (Number(i.amount) || 0) > 0) {
      const d = paymentDateFor(i);
      if (d) return d;
    }
  }
  return "";
}

export function getNextDueDate(c: Candidate): string {
  const dates = (c.installments || [])
    .filter((i) => i && !i.paid && (Number(i.amount) || 0) > 0 && i.date)
    .map((i) => new Date(i.date + "T00:00:00"))
    .filter((d) => !isNaN(d.getTime()));
  return dates.length
    ? new Date(Math.min(...dates.map((d) => d.getTime())))
        .toISOString()
        .slice(0, 10)
    : "";
}

export function getComplianceStatus(c: Candidate): string {
  if (getRemaining(c) <= 0) return "Completed";
  const next = getNextDueDate(c);
  if (!next) return "Pending";
  const days =
    (new Date(next + "T00:00:00").getTime() - Date.now()) / 86400000;
  if (days < 0) return "Overdue";
  if (days <= 7) return "Due Soon";
  return "On Track";
}

export function getDueForMonth(c: Candidate, d: Date): number {
  return c.installments.reduce((s, i) => {
    if (!i.paid && i.date) {
      const x = new Date(i.date + "T00:00:00");
      if (
        x.getMonth() === d.getMonth() &&
        x.getFullYear() === d.getFullYear()
      ) {
        s += Number(i.amount) || 0;
      }
    }
    return s;
  }, 0);
}

export function priority(c: Candidate, d: Date): string {
  const next = getNextDueDate(c);
  if (!next) return "Green";
  const days =
    (new Date(d.getFullYear(), d.getMonth(), 1).getTime() -
      new Date(next + "T00:00:00").getTime()) /
    86400000;
  if (days > 60) return "Red";
  if (days > 30) return "Orange";
  const nd = new Date(next + "T00:00:00");
  if (nd.getMonth() === d.getMonth() && nd.getFullYear() === d.getFullYear())
    return "Yellow";
  return "Green";
}

export function statusExcluded(s: string): boolean {
  return [
    "cancelled",
    "refunded",
    "closed",
    "fully paid",
    "inactive",
  ].includes(String(s || "").toLowerCase());
}

export function rowColorClass(c: Candidate): string {
  const st = String(c.status || "Active").toLowerCase();
  if (st.includes("run")) return "row-run-away";
  if (st.includes("lost")) return "row-job-lost";
  if (st.includes("cancel")) return "row-cancelled";
  if (st.includes("refund")) return "row-refunded";
  if (st.includes("closed")) return "row-closed";
  if (st.includes("inactive")) return "row-inactive";
  if (st.includes("fully") || (getRemaining(c) <= 0 && Number(c.totalServiceFee) > 0))
    return "row-fully-paid";
  if (st.includes("active")) return "row-active";
  return "row-neutral";
}

export function badgeClass(t: string): string {
  const map: Record<string, string> = {
    Active: "badge-success",
    Inactive: "badge-default",
    Completed: "badge-success",
    Cancelled: "badge-danger",
    "Lost Job": "badge-warning",
    "Job Lost": "badge-warning",
    Refunded: "badge-info",
    Closed: "badge-default",
    Overdue: "badge-danger",
    "Due Soon": "badge-warning",
    "On Track": "badge-info",
    Pending: "badge-warning",
    Paid: "badge-success",
    "Fully Paid": "badge-success",
    "Run Away": "badge-warning",
    "No Response": "badge-warning",
    "Payment Hold": "badge-info",
  };
  return map[t] || "badge-default";
}

export function nextUnpaid(
  c: Candidate
): { inst: Installment; idx: number } | null {
  return (
    (c.installments || [])
      .map((i, idx) => ({ inst: i, idx }))
      .filter(
        (x) =>
          x.inst &&
          !x.inst.paid &&
          (Number(x.inst.amount) || 0) > 0 &&
          x.inst.date
      )
      .sort((a, b) => String(a.inst.date).localeCompare(String(b.inst.date)))[0] ||
    null
  );
}

export function cleanPhone(v: string): string {
  return String(v || "").replace(/\D/g, "");
}

export function phoneOf(c: Candidate): string {
  return String(c?.phoneNumber || "").trim();
}
