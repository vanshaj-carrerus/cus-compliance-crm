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

// Formats a Date's *local* calendar day as YYYY-MM-DD. Never use
// toISOString() for this: it converts to UTC first, so a local-midnight Date
// lands on the previous day in any timezone ahead of UTC (e.g. IST).
export function toIsoDate(d: Date): string {
  return (
    d.getFullYear() +
    "-" +
    String(d.getMonth() + 1).padStart(2, "0") +
    "-" +
    String(d.getDate()).padStart(2, "0")
  );
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
      return toIsoDate(new Date(Number(year), m, Number(day)));
    }
  }
  const d = new Date(str);
  return isNaN(d.getTime()) ? "" : toIsoDate(d);
}

function validYmd(y: number, m: number, d: number): string {
  const dt = new Date(y, m - 1, d);
  if (dt.getFullYear() !== y || dt.getMonth() !== m - 1 || dt.getDate() !== d)
    return "";
  return toIsoDate(dt);
}

// Returns YYYY-MM-DD when `v` is nothing but a date, else "". Unlike
// parseDate it never guesses at free text, so callers can safely use it to
// tell "this is a date" apart from "this starts with an amount".
// Numeric day/month order: a part > 12 settles it, otherwise day-first.
export function parseBareDate(v: string): string {
  const s = String(v || "").trim();
  if (!s) return "";
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T\s].*)?$/);
  if (iso) return validYmd(+iso[1], +iso[2], +iso[3]);
  const num = s.match(/^(\d{1,4})[/.-](\d{1,2})[/.-](\d{1,4})$/);
  if (num) {
    const [a, b, c] = [num[1], num[2], num[3]];
    if (a.length === 4) return validYmd(+a, +b, +c);
    if (c.length !== 4 && c.length !== 2) return "";
    const year = c.length === 2 ? 2000 + +c : +c;
    return +b > 12 ? validYmd(year, +a, +b) : validYmd(year, +b, +a);
  }
  const txt = s.match(
    /^(?:(\d{1,2})(?:st|nd|rd|th)?[\s-]+)?([a-z]{3,9})\.?[\s-]*(?:(\d{1,2})(?:st|nd|rd|th)?)?,?[\s-]+(\d{4})$/i
  );
  if (txt && (txt[1] != null) !== (txt[3] != null)) {
    const mi = MONTHS.findIndex(
      (m) => m.toLowerCase().slice(0, 3) === txt[2].slice(0, 3).toLowerCase()
    );
    if (mi >= 0) return validYmd(+txt[4], mi + 1, +(txt[1] ?? txt[3]));
  }
  return "";
}

// For a cell that holds only a date: accepts everything parseBareDate does,
// plus month-name text without a year ("Jan 14"). Returns "" if unreadable.
export function parseDateInput(v: string): string {
  const s = String(v || "").trim();
  if (!s) return "";
  return parseBareDate(s) || (/[a-z]/i.test(s) ? parseDate(s) : "");
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
