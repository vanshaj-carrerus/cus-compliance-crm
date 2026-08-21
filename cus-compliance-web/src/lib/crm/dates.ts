import { MONTHS } from "./types";

export function todayIso(): string {
  const d = new Date();
  return (
    d.getFullYear() +
    "-" +
    String(d.getMonth() + 1).padStart(2, "0") +
    "-" +
    String(d.getDate()).padStart(2, "0")
  );
}

export function addDays(iso: string, n: number): string {
  const d = new Date((iso || todayIso()) + "T00:00:00");
  d.setDate(d.getDate() + Number(n || 0));
  return (
    d.getFullYear() +
    "-" +
    String(d.getMonth() + 1).padStart(2, "0") +
    "-" +
    String(d.getDate()).padStart(2, "0")
  );
}

export function diffDays(a: string, b: string): number {
  return Math.round(
    (new Date(a + "T00:00:00").getTime() -
      new Date(b + "T00:00:00").getTime()) /
      86400000
  );
}

export function currentCycleStart(now = new Date()): Date {
  return now.getDate() >= 25
    ? new Date(now.getFullYear(), now.getMonth(), 25)
    : new Date(now.getFullYear(), now.getMonth() - 1, 25);
}

export function addDaysDate(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

export function toIsoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function fmtDate(v: string): string {
  if (!v) return "-";
  const d = new Date(v.includes("T") ? v : v + "T00:00:00");
  if (isNaN(d.getTime())) return v;
  return d.toLocaleDateString("en-US", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function fmtDateShort(v: string): string {
  if (!v) return "";
  return fmtDate(v).replace(/, \d{4}$/, "");
}

export function fmtMonth(d: Date): string {
  return MONTHS[d.getMonth()] + " " + d.getFullYear();
}

export function parseDate(str: string): string {
  str = String(str || "")
    .toLowerCase()
    .replace(/(st|nd|rd|th)/g, "")
    .trim();
  if (!str) return "";
  const iso = str.match(/\d{4}-\d{2}-\d{2}/);
  if (iso) return iso[0];
  const months: Record<string, number> = {
    jan: 0,
    feb: 1,
    mar: 2,
    apr: 3,
    may: 4,
    jun: 5,
    jul: 6,
    aug: 7,
    sep: 8,
    sept: 8,
    oct: 9,
    nov: 10,
    dec: 11,
  };
  for (const [k, m] of Object.entries(months)) {
    if (str.includes(k)) {
      const day = (str.match(/\d{1,2}/) || ["1"])[0];
      const year = (
        str.match(/\b(20\d{2}|19\d{2})\b/) || [String(new Date().getFullYear())]
      )[0];
      return new Date(Number(year), m, Number(day)).toISOString().slice(0, 10);
    }
  }
  const d = new Date(str);
  return isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10);
}

export function validDateString(v?: string): string {
  if (!v) return "";
  const d = new Date(String(v) + "T00:00:00");
  if (isNaN(d.getTime())) return "";
  return (
    d.getFullYear() +
    "-" +
    String(d.getMonth() + 1).padStart(2, "0") +
    "-" +
    String(d.getDate()).padStart(2, "0")
  );
}

export function normalizeMonthLabel(v: string): string {
  const raw = String(v ?? "").trim();
  if (!raw) return "";
  const lower = raw.toLowerCase();
  const monthAlias: Record<string, string> = {
    jan: "January",
    january: "January",
    feb: "February",
    february: "February",
    mar: "March",
    march: "March",
    apr: "April",
    april: "April",
    may: "May",
    jun: "June",
    june: "June",
    jul: "July",
    july: "July",
    aug: "August",
    august: "August",
    sep: "September",
    sept: "September",
    september: "September",
    oct: "October",
    october: "October",
    nov: "November",
    november: "November",
    dec: "December",
    december: "December",
  };
  for (const [k, val] of Object.entries(monthAlias)) {
    if (
      lower === k ||
      lower.startsWith(k + " ") ||
      lower.includes(" " + k + " ") ||
      lower.includes(k + "-")
    ) {
      const y = raw.match(/\b(20\d{2}|19\d{2})\b/);
      return y ? val + " " + y[1] : val;
    }
  }
  return raw;
}

export function monthFromDateText(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso.includes("T") ? iso : iso + "T00:00:00");
  if (isNaN(d.getTime())) return "";
  return MONTHS[d.getMonth()] + " " + d.getFullYear();
}
