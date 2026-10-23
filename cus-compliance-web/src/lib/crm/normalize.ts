import type {
  Candidate,
  CrmSettings,
  Installment,
  ContactMethod,
} from "./types";
import {
  DEFAULT_WHATSAPP_TEMPLATES,
  DEFAULT_WORKFLOW_RULES,
  CONTACT_METHODS,
} from "./types";
import { round, parseMoney } from "./calc";
import {
  currentCycleStart,
  addDaysDate,
  toIsoDate,
  parseDate,
  parseBareDate,
  normalizeMonthLabel,
  monthFromDateText,
} from "./dates";

export const MAX_INSTALLMENTS = 9;

export function normalizeInst(i?: Partial<Installment> | null): Installment {
  return {
    amount: i && i.amount ? String(i.amount) : "",
    date: i && i.date ? String(i.date) : "",
    paid: !!(i && i.paid),
    receipt: i && i.receipt ? String(i.receipt) : "",
    notes: i && i.notes ? String(i.notes) : "",
    paymentDate: i && i.paymentDate ? String(i.paymentDate) : "",
  };
}

export function isEmptyInstallment(i: Installment): boolean {
  return (
    !String(i.amount || "").trim() &&
    !i.date &&
    !i.paid &&
    !String(i.receipt || "").trim() &&
    !String(i.notes || "").trim() &&
    !i.paymentDate
  );
}

function buildInstallments(input?: Partial<Installment>[]): Installment[] {
  const trimmed = (input || []).map((raw) => normalizeInst(raw));
  while (
    trimmed.length > 0 &&
    isEmptyInstallment(trimmed[trimmed.length - 1])
  ) {
    trimmed.pop();
  }
  const padded = [...trimmed];
  while (padded.length < MAX_INSTALLMENTS) padded.push(normalizeInst(null));
  return padded.slice(0, MAX_INSTALLMENTS);
}

function parseInstCount(terms: string): number {
  const m = String(terms || "").match(/(\d+)\s*install/i);
  return m ? Math.max(1, Math.min(9, Number(m[1]))) : 0;
}

export function newId(): number {
  return Date.now() + Math.random();
}

export function normalizeCandidate(c: Partial<Candidate> = {}): Candidate {
  const raw = c as Partial<Candidate> & Record<string, unknown>;
  const inst = buildInstallments(c.installments);
  const nonEmptyCount = inst.filter((x) => !isEmptyInstallment(x)).length;
  const annual = Number(c.annualPackage) || 0;
  const pct = Number(c.serviceFeePercent) || 0;
  const rawTotal = Number(c.totalServiceFee) || 0;
  const totalServiceFee = round(annual && pct ? (annual * pct) / 100 : rawTotal);

  let assignedTo = String(c.assignedTo || "").trim();
  if (assignedTo === "Jayraj bhai") assignedTo = "Jayraj";

  const phoneNumber =
    String(
      c.phoneNumber ||
        raw.phone ||
        raw.mobile ||
        raw.contactNumber ||
        ""
    ).trim() || "";

  let poMonth = normalizeMonthLabel(
    String(c.poMonth || raw.poMonthName || raw.month || raw.po_month || "")
  );
  const startDate = String(c.startDate || "");
  if (!poMonth && startDate) poMonth = monthFromDateText(startDate);

  const explicit = Number(c.installmentCount) || 0;
  const installmentCount = explicit
    ? Math.max(1, Math.min(MAX_INSTALLMENTS, Math.round(explicit)))
    : Math.max(
        nonEmptyCount,
        parseInstCount(String(c.terms || "")) || nonEmptyCount
      );

  let contactMethod = String(
    c.contactMethod || "No Contact"
  ) as ContactMethod;
  if (!CONTACT_METHODS.includes(contactMethod)) contactMethod = "No Contact";

  const out: Candidate = {
    id: typeof c.id === "number" ? c.id : Number(c.id) || newId(),
    name: String(c.name || ""),
    phoneNumber,
    assignedTo,
    floor: String(c.floor || ""),
    annualPackage: annual,
    serviceFeePercent: pct,
    totalServiceFee,
    terms: String(c.terms || ""),
    po: String(c.po || ""),
    poMonth,
    startDate,
    status: String(c.status || ""),
    remarks: String(c.remarks || ""),
    installmentCount,
    installments: inst,
    lastContactDate: String(c.lastContactDate || ""),
    nextFollowUpDate: String(c.nextFollowUpDate || ""),
    contactMethod,
    contactNotes: String(c.contactNotes || ""),
    messageLog: Array.isArray(c.messageLog) ? c.messageLog : [],
    expectedDate: c.expectedDate ? String(c.expectedDate) : "",
    expectedAmount: c.expectedAmount ?? "",
    monthRemarks: c.monthRemarks ? String(c.monthRemarks) : "",
    targetPaidManual: !!c.targetPaidManual,
    createdAt: String(c.createdAt || new Date().toISOString()),
    updatedAt: new Date().toISOString(),
  };

  return out;
}

export function parseInstallment(v: string): Partial<Installment> {
  const r: Partial<Installment> = {
    amount: "",
    date: "",
    paid: false,
    receipt: "",
    notes: "",
  };
  v = String(v || "").trim();
  if (!v) return r;
  // A bare date ("2026-01-10", "14 Jan 2026") must not fall through to the
  // amount regex below, which would read its leading digits as the amount.
  const bare = parseBareDate(v);
  if (bare) {
    r.date = bare;
    return r;
  }
  const m = v.match(/^\$?\s*(\d[\d,]*\.?\d*)\s*(.*)$/);
  if (m) {
    r.amount = m[1].replace(/,/g, "");
    r.date = parseDate(m[2]);
  }
  return r;
}

// Clipboard variant of parseInstallment: works out whether the pasted text is
// an amount, a date, or both, and returns ONLY the parts it found so pasting
// a single value never wipes the other one already in the cell. Empty text
// still means "clear the cell"; text that is neither is ignored.
export function parsePasteInstallment(v: string): Partial<Installment> {
  const text = String(v || "").trim();
  if (!text) return parseInstallment(text);
  // Looks like a date but isn't a real one (2026-13-40): don't read its
  // leading digits as an amount.
  if (/^\d{4}-\d{2}-\d{2}$/.test(text) && !parseBareDate(text)) return {};
  const parsed = parseInstallment(text);
  const out: Partial<Installment> = {};
  if (parsed.amount) out.amount = parsed.amount;
  if (parsed.date) out.date = parsed.date;
  return out;
}

export function defaultSettings(): CrmSettings {
  const start = currentCycleStart();
  const end = addDaysDate(start, 31);
  return {
    targetMonth: new Date().toISOString(),
    incentiveStart: start.toISOString(),
    incentiveFrom: toIsoDate(start),
    incentiveTo: toIsoDate(end),
    whatsappTemplates: { ...DEFAULT_WHATSAPP_TEMPLATES },
    workflowRules: { ...DEFAULT_WORKFLOW_RULES },
    workflowLog: [],
    workflowState: {},
    workflowLastRun: "",
    lastDigestRead: "",
    targetPaidMonthFilter: "",
    targetSortByDate: false,
  };
}

export function mergeSettings(
  partial?: Partial<CrmSettings> | null
): CrmSettings {
  const base = defaultSettings();
  if (!partial) return base;
  return {
    ...base,
    ...partial,
    whatsappTemplates: {
      ...DEFAULT_WHATSAPP_TEMPLATES,
      ...(partial.whatsappTemplates || {}),
    },
    workflowRules: {
      ...DEFAULT_WORKFLOW_RULES,
      ...(partial.workflowRules || {}),
    },
    workflowLog: Array.isArray(partial.workflowLog)
      ? partial.workflowLog
      : base.workflowLog,
    workflowState: partial.workflowState || {},
  };
}

export { parseMoney };
