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
import { round, getRemaining, parseMoney } from "./calc";
import {
  currentCycleStart,
  addDaysDate,
  toIsoDate,
  parseDate,
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

  let assignedTo = String(c.assignedTo || "Yatin");
  if (assignedTo === "Jayraj bhai") assignedTo = "Jayraj";
  if (assignedTo !== "Jayraj") assignedTo = "Yatin";

  let phoneNumber =
    String(
      c.phoneNumber ||
        raw.phone ||
        raw.mobile ||
        raw.contactNumber ||
        ""
    ).trim() || "";
  const candidateNumber = String(c.candidateNumber || "").trim();
  if (!phoneNumber && candidateNumber && /\d{4,}/.test(candidateNumber)) {
    phoneNumber = candidateNumber;
  }

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

  let out: Candidate = {
    id: typeof c.id === "number" ? c.id : Number(c.id) || newId(),
    name: String(c.name || ""),
    phoneNumber,
    candidateNumber,
    assignedTo: assignedTo as "Yatin" | "Jayraj",
    floor: String(c.floor || ""),
    annualPackage: annual,
    serviceFeePercent: pct,
    totalServiceFee,
    terms: String(c.terms || ""),
    po: String(c.po || ""),
    poMonth,
    startDate,
    status: String(c.status || "Active"),
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

  if (
    getRemaining(out) <= 0 &&
    out.totalServiceFee > 0 &&
    out.status === "Active"
  ) {
    out.status = "Inactive";
  }

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
  const m = v.match(/^\$?\s*(\d[\d,]*\.?\d*)\s*(.*)$/);
  if (m) {
    r.amount = m[1].replace(/,/g, "");
    r.date = parseDate(m[2]);
  }
  return r;
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
