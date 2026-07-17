import type {
  Candidate,
  CrmBackup,
  CrmSettings,
  Installment,
  PaymentHistory,
} from "./types";
import { fmtDateShort } from "./dates";
import { phoneOf } from "./calc";
import { parseInstallment } from "./normalize";

const EXCEL_MIME =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

/** Matches the familiar candidate spreadsheet layout; extras follow. */
const CANDIDATE_CORE_COLUMNS = [
  "Month",
  "total",
  "Terms.",
  "P.O.",
  "Start date",
  "Candidate name",
  "1st date",
  "2nd date",
  "3rd date",
  "4th date",
  "5th date",
  "6th date",
  "7th date",
  "8th date",
  "9th date",
] as const;

const CANDIDATE_EXTRA_COLUMNS = [
  "floor",
  "Amount and percentage",
  "Phone Number",
  "Assigned To",
  "Status",
  "Remarks",
  "Last Contact Date",
  "Next Follow-up Date",
  "Contact Method",
  "Contact Notes",
  "Paid Installments",
  "id",
  "candidateNumber",
  "installmentCount",
  "expectedDate",
  "expectedAmount",
  "monthRemarks",
  "targetPaidManual",
  "createdAt",
  "updatedAt",
] as const;

const CANDIDATE_COLUMNS = [
  ...CANDIDATE_CORE_COLUMNS,
  ...CANDIDATE_EXTRA_COLUMNS,
] as const;

const INSTALLMENT_DATE_COLUMNS = [
  "1st date",
  "2nd date",
  "3rd date",
  "4th date",
  "5th date",
  "6th date",
  "7th date",
  "8th date",
  "9th date",
] as const;

const INSTALLMENT_COLUMNS = [
  "candidateId",
  "index",
  "amount",
  "date",
  "paid",
  "receipt",
  "notes",
  "paymentDate",
] as const;

const MESSAGE_COLUMNS = [
  "candidateId",
  "id",
  "template",
  "timestamp",
  "message",
] as const;

const HISTORY_COLUMNS = [
  "id",
  "candidateId",
  "candidateName",
  "assignedTo",
  "floor",
  "date",
  "amount",
  "type",
  "notes",
  "template",
  "message",
  "timestamp",
] as const;

const SETTING_KEYS: (keyof CrmSettings)[] = [
  "targetMonth",
  "incentiveStart",
  "incentiveFrom",
  "incentiveTo",
  "workflowLastRun",
  "lastDigestRead",
  "masterColumnConfig",
  "masterDensity",
  "masterFreezeMode",
  "targetPaidMonthFilter",
  "targetSortByDate",
];

type SheetRecord = Record<string, unknown>;

type ExcelWorkbook = {
  creator: string;
  created: Date;
  modified: Date;
  addWorksheet: (
    name: string,
    opts?: { views?: Array<{ state: string; ySplit: number }> }
  ) => ExcelWorksheet;
  xlsx: {
    writeBuffer: () => Promise<ArrayBuffer | Uint8Array>;
    load: (data: ArrayBuffer) => Promise<unknown>;
  };
  getWorksheet: (name: string) => ExcelWorksheet | undefined;
};

type ExcelWorksheet = {
  addRow: (values: unknown[]) => {
    eachCell: (cb: (cell: ExcelCell) => void) => void;
    getCell: (n: number) => ExcelCell;
  };
  eachRow: (
    cb: (row: { getCell: (n: number) => ExcelCell }, rowNumber: number) => void
  ) => void;
  getRow: (n: number) => {
    values: unknown[];
    getCell: (n: number) => ExcelCell;
    eachCell: (cb: (cell: ExcelCell) => void) => void;
  };
  rowCount: number;
  autoFilter: unknown;
  columns: Array<{ width?: number }>;
};

type ExcelCell = {
  value: unknown;
  font?: unknown;
  fill?: unknown;
  alignment?: unknown;
  numFmt?: string;
};

type ExcelJSModule = {
  Workbook: new () => ExcelWorkbook;
};

async function loadExcelJS(): Promise<ExcelJSModule> {
  // Prefer the browser build — the package main entry is Node-only.
  const mod = (await import(
    /* webpackIgnore: false */
    "exceljs/dist/exceljs.min.js"
  )) as ExcelJSModule & { default?: ExcelJSModule };
  return mod.default ?? mod;
}

function addSheet(
  workbook: ExcelWorkbook,
  name: string,
  columns: readonly string[],
  rows: SheetRecord[],
  options: {
    dateColumns?: readonly string[];
    dateTimeColumns?: readonly string[];
    dateKind?: (
      record: SheetRecord,
      column: string
    ) => "date" | "datetime" | undefined;
  } = {}
) {
  const sheet = workbook.addWorksheet(name, {
    views: [{ state: "frozen", ySplit: 1 }],
  });
  const header = sheet.addRow([...columns]);
  header.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFC2185B" },
    };
    cell.alignment = { vertical: "middle" };
  });
  rows.forEach((record) => {
    const kinds = columns.map(
      (column) =>
        options.dateKind?.(record, column) ||
        (options.dateColumns?.includes(column) ? "date" : undefined) ||
        (options.dateTimeColumns?.includes(column) ? "datetime" : undefined)
    );
    const row = sheet.addRow(
      columns.map((column, index) => {
        const value = record[column] ?? "";
        return kinds[index] ? toExcelDate(value) : value;
      })
    );
    kinds.forEach((kind, index) => {
      const cell = row.getCell(index + 1);
      if (kind && cell.value instanceof Date) {
        cell.numFmt =
          kind === "date"
            ? "dd-mmm-yyyy"
            : "dd-mmm-yyyy hh:mm AM/PM";
      }
    });
  });
  sheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: Math.max(1, sheet.rowCount), column: columns.length },
  };
  sheet.columns.forEach((column, index) => {
    const headerLength = columns[index]?.length ?? 10;
    column.width = Math.min(42, Math.max(12, headerLength + 2));
  });
  return sheet;
}

function toExcelDate(value: unknown): Date | unknown {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? "" : value;
  }
  const text = String(value ?? "").trim();
  if (!text) return "";

  const dateOnly = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (dateOnly) {
    const date = new Date(
      Number(dateOnly[1]),
      Number(dateOnly[2]) - 1,
      Number(dateOnly[3])
    );
    return Number.isNaN(date.getTime()) ? value : date;
  }

  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? value : date;
}

function dateText(value: string): string {
  const parsed = toExcelDate(value);
  if (!(parsed instanceof Date)) return fmtDateShort(value);
  return parsed.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function installmentToSheetText(inst?: Installment | null): string {
  if (!inst) return "";
  const amount = String(inst.amount || "").trim();
  const date = inst.date ? dateText(inst.date) : "";
  const extra = String(inst.notes || inst.receipt || "").trim();
  if (!amount && !date && !extra) return "";
  if (!amount && extra) return extra;
  return [amount, date, extra].filter(Boolean).join(" ");
}

function candidateRows(candidates: Candidate[]): SheetRecord[] {
  return candidates.map((candidate) => {
    const installments = safeInstallments(candidate);
    const row: SheetRecord = {
      Month: candidate.poMonth || "",
      total: candidate.totalServiceFee || "",
      "Terms.": candidate.terms || "",
      "P.O.": candidate.po || "",
      "Start date": candidate.startDate || "",
      "Candidate name": candidate.name || "",
      floor: candidate.floor || "",
      "Amount and percentage":
        (candidate.annualPackage || "") +
        "/" +
        (candidate.serviceFeePercent || 0) +
        "%",
      "Phone Number": phoneOf(candidate),
      "Assigned To": candidate.assignedTo || "",
      Status: candidate.status || "",
      Remarks: candidate.remarks || "",
      "Last Contact Date": candidate.lastContactDate || "",
      "Next Follow-up Date": candidate.nextFollowUpDate || "",
      "Contact Method": candidate.contactMethod || "",
      "Contact Notes": candidate.contactNotes || "",
      "Paid Installments": installments
        .map((inst, idx) => (inst.paid ? idx + 1 : null))
        .filter(Boolean)
        .join("|"),
      id: candidate.id,
      candidateNumber: candidate.candidateNumber || "",
      installmentCount: candidate.installmentCount || "",
      expectedDate: candidate.expectedDate || "",
      expectedAmount: candidate.expectedAmount ?? "",
      monthRemarks: candidate.monthRemarks || "",
      targetPaidManual: !!candidate.targetPaidManual,
      createdAt: candidate.createdAt || "",
      updatedAt: candidate.updatedAt || "",
    };
    INSTALLMENT_DATE_COLUMNS.forEach((column, index) => {
      row[column] = installmentToSheetText(installments[index]);
    });
    return row;
  });
}

function safeInstallments(candidate: Candidate): Installment[] {
  return Array.isArray(candidate.installments) ? candidate.installments : [];
}

function safeMessageLog(candidate: Candidate) {
  return Array.isArray(candidate.messageLog) ? candidate.messageLog : [];
}

export async function createCrmWorkbook(backup: CrmBackup): Promise<Blob> {
  const ExcelJS = await loadExcelJS();
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "CareerUS CRM";
  workbook.created = new Date();
  workbook.modified = new Date();

  const candidates = Array.isArray(backup.candidates) ? backup.candidates : [];
  const history = Array.isArray(backup.history) ? backup.history : [];
  const settings = backup.settings || ({} as CrmSettings);

  addSheet(
    workbook,
    "Meta",
    ["key", "value"],
    [
      { key: "version", value: backup.version },
      { key: "exportedAt", value: backup.exportedAt },
    ],
    {
      dateKind: (record, column) =>
        column === "value" && record.key === "exportedAt"
          ? "datetime"
          : undefined,
    }
  );
  addSheet(
    workbook,
    "Candidates",
    CANDIDATE_COLUMNS,
    candidateRows(candidates),
    {
      dateColumns: [
        "Start date",
        "Last Contact Date",
        "Next Follow-up Date",
        "expectedDate",
      ],
      dateTimeColumns: ["createdAt", "updatedAt"],
    }
  );
  addSheet(
    workbook,
    "Installments",
    INSTALLMENT_COLUMNS,
    candidates.flatMap((candidate) =>
      safeInstallments(candidate).map((installment, index) => ({
        candidateId: candidate.id,
        index,
        ...installment,
      }))
    ),
    { dateColumns: ["date", "paymentDate"] }
  );
  addSheet(
    workbook,
    "MessageLog",
    MESSAGE_COLUMNS,
    candidates.flatMap((candidate) =>
      safeMessageLog(candidate).map((entry) => ({
        candidateId: candidate.id,
        ...entry,
      }))
    ),
    { dateTimeColumns: ["timestamp"] }
  );
  addSheet(
    workbook,
    "PaymentHistory",
    HISTORY_COLUMNS,
    history as unknown as SheetRecord[],
    {
      dateColumns: ["date"],
      dateTimeColumns: ["timestamp"],
    }
  );
  addSheet(
    workbook,
    "Settings",
    ["key", "value"],
    SETTING_KEYS.map((key) => ({
      key,
      value: [
        "targetMonth",
        "incentiveStart",
        "incentiveFrom",
        "incentiveTo",
        "workflowLastRun",
        "lastDigestRead",
      ].includes(key)
        ? settings[key] ?? ""
        : JSON.stringify(settings[key] ?? null),
    })),
    {
      dateKind: (record, column) => {
        if (column !== "value") return undefined;
        const key = String(record.key ?? "");
        if (["incentiveFrom", "incentiveTo"].includes(key)) return "date";
        if (
          [
            "targetMonth",
            "incentiveStart",
            "workflowLastRun",
            "lastDigestRead",
          ].includes(key)
        )
          return "datetime";
        return undefined;
      },
    }
  );
  addSheet(
    workbook,
    "WhatsAppTemplates",
    ["name", "body"],
    Object.entries(settings.whatsappTemplates || {}).map(([name, body]) => ({
      name,
      body,
    }))
  );
  addSheet(
    workbook,
    "WorkflowRules",
    ["rule", "enabled"],
    Object.entries(settings.workflowRules || {}).map(([rule, enabled]) => ({
      rule,
      enabled,
    }))
  );
  addSheet(
    workbook,
    "WorkflowLog",
    ["id", "timestamp", "rule", "candidateId", "candidateName", "action"],
    (settings.workflowLog || []) as unknown as SheetRecord[],
    { dateTimeColumns: ["timestamp"] }
  );
  addSheet(
    workbook,
    "WorkflowState",
    ["key", "value"],
    Object.entries(settings.workflowState || {}).map(([key, value]) => ({
      key,
      value,
    }))
  );

  const buffer = await workbook.xlsx.writeBuffer();
  const bytes = buffer instanceof Uint8Array
    ? Uint8Array.from(buffer)
    : new Uint8Array(buffer);
  return new Blob([bytes], { type: EXCEL_MIME });
}

function cellValue(value: unknown): unknown {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString();
  if (typeof value !== "object") return value;
  const obj = value as Record<string, unknown>;
  if ("result" in obj) return cellValue(obj.result);
  if ("richText" in obj && Array.isArray(obj.richText)) {
    return (obj.richText as Array<{ text?: string }>)
      .map((part) => part.text || "")
      .join("");
  }
  if ("text" in obj) return obj.text;
  return String(value);
}

function sheetRecords(
  sheet: ExcelWorksheet | undefined,
  required = false
): SheetRecord[] {
  if (!sheet) {
    if (required) throw new Error("Required worksheet is missing");
    return [];
  }
  const headers = (Array.isArray(sheet.getRow(1).values)
    ? sheet.getRow(1).values
    : []
  )
    .slice(1)
    .map((value) => String(cellValue(value)).trim());
  const records: SheetRecord[] = [];
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const record: SheetRecord = {};
    let hasValue = false;
    headers.forEach((header, index) => {
      if (!header) return;
      const value = cellValue(row.getCell(index + 1).value);
      record[header] = value;
      if (value !== "") hasValue = true;
    });
    if (hasValue) records.push(record);
  });
  return records;
}

function asNumber(value: unknown): number {
  const number = Number(
    String(value ?? "")
      .replace(/,/g, "")
      .trim()
  );
  return Number.isFinite(number) ? number : 0;
}

function asBoolean(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  return ["true", "1", "yes"].includes(String(value).trim().toLowerCase());
}

function asDateOnly(value: unknown): string {
  const text = String(value ?? "").trim();
  const iso = text.match(/^(\d{4}-\d{2}-\d{2})/);
  return iso ? iso[1] : text;
}

function parseSetting(value: unknown): unknown {
  const text = String(value ?? "");
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function splitAmountPercent(text: string): { annual: number; pct: number } {
  const raw = String(text || "").trim();
  let pct = 0;
  const pctMatch = raw.match(/(\d+(?:\.\d+)?)\s*%/);
  if (pctMatch) pct = Number(pctMatch[1]);
  let annual = 0;
  const slash = raw.split("/");
  if (slash.length >= 2) {
    annual = asNumber(slash[0]);
  } else {
    annual = asNumber(raw);
  }
  return { annual, pct };
}

function recordGet(record: SheetRecord, ...keys: string[]): unknown {
  for (const key of keys) {
    if (record[key] !== undefined && record[key] !== "") return record[key];
  }
  return "";
}

function installmentsFromCandidateRow(record: SheetRecord): Installment[] {
  return INSTALLMENT_DATE_COLUMNS.map((column) => {
    const text = String(record[column] ?? "").trim();
    if (!text) {
      return {
        amount: "",
        date: "",
        paid: false,
        receipt: "",
        notes: "",
        paymentDate: "",
      };
    }
    const parsed = parseInstallment(text);
    const leftover = text
      .replace(String(parsed.amount || ""), "")
      .replace(String(parsed.date || ""), "")
      .trim();
    return {
      amount: String(parsed.amount || ""),
      date: String(parsed.date || ""),
      paid: false,
      receipt: "",
      notes: leftover,
      paymentDate: "",
    };
  });
}

export async function parseCrmWorkbook(
  input: ArrayBuffer
): Promise<CrmBackup> {
  const ExcelJS = await loadExcelJS();
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(input);

  const candidateRecords = sheetRecords(
    workbook.getWorksheet("Candidates"),
    true
  );
  const installmentRecords = sheetRecords(
    workbook.getWorksheet("Installments")
  );
  const messageRecords = sheetRecords(workbook.getWorksheet("MessageLog"));
  const historyRecords = sheetRecords(
    workbook.getWorksheet("PaymentHistory")
  );
  const metaRecords = sheetRecords(workbook.getWorksheet("Meta"));
  const settingRecords = sheetRecords(workbook.getWorksheet("Settings"));

  const candidates = candidateRecords
    .map((record) => {
      const name = String(
        recordGet(record, "Candidate name", "name")
      ).trim();
      // Skip month section rows like "January" with no candidate.
      if (!name) return null;

      const id = asNumber(recordGet(record, "id"));
      const amountPct = String(
        recordGet(record, "Amount and percentage")
      ).trim();
      const { annual, pct } = splitAmountPercent(amountPct);

      const fromDetailSheet = installmentRecords
        .filter((row) => asNumber(row.candidateId) === id && id)
        .sort((a, b) => asNumber(a.index) - asNumber(b.index))
        .map((row) => ({
          amount: String(row.amount ?? ""),
          date: asDateOnly(row.date),
          paid: asBoolean(row.paid),
          receipt: String(row.receipt ?? ""),
          notes: String(row.notes ?? ""),
          paymentDate: asDateOnly(row.paymentDate),
        }));

      let installments =
        fromDetailSheet.length > 0
          ? fromDetailSheet
          : installmentsFromCandidateRow(record);

      const paidSet = new Set(
        String(recordGet(record, "Paid Installments"))
          .split("|")
          .map(Number)
          .filter((n) => Number.isFinite(n) && n > 0)
      );
      if (paidSet.size) {
        installments = installments.map((inst, idx) =>
          paidSet.has(idx + 1)
            ? {
                ...inst,
                paid: true,
                paymentDate: inst.paymentDate || inst.date || "",
              }
            : inst
        );
      }

      const messageLog = messageRecords
        .filter((row) => asNumber(row.candidateId) === id && id)
        .map((row) => ({
          id: asNumber(row.id),
          template: String(row.template ?? ""),
          timestamp: String(row.timestamp ?? ""),
          message: String(row.message ?? ""),
        }));

      return {
        id: id || undefined,
        name,
        phoneNumber: String(
          recordGet(record, "Phone Number", "phoneNumber")
        ),
        candidateNumber: String(recordGet(record, "candidateNumber")),
        assignedTo: String(
          recordGet(record, "Assigned To", "assignedTo") || "Yatin"
        ),
        floor: String(recordGet(record, "floor")),
        annualPackage: annual || asNumber(record.annualPackage),
        serviceFeePercent: pct || asNumber(record.serviceFeePercent),
        totalServiceFee: asNumber(recordGet(record, "total", "totalServiceFee")),
        terms: String(recordGet(record, "Terms.", "terms")),
        po: String(recordGet(record, "P.O.", "po")),
        poMonth: String(recordGet(record, "Month", "poMonth")),
        startDate: asDateOnly(recordGet(record, "Start date", "startDate")),
        status: String(recordGet(record, "Status", "status") || "Active"),
        remarks: String(recordGet(record, "Remarks", "remarks")),
        installmentCount: asNumber(recordGet(record, "installmentCount")),
        installments,
        lastContactDate: asDateOnly(
          recordGet(record, "Last Contact Date", "lastContactDate")
        ),
        nextFollowUpDate: asDateOnly(
          recordGet(record, "Next Follow-up Date", "nextFollowUpDate")
        ),
        contactMethod: String(
          recordGet(record, "Contact Method", "contactMethod") || "No Contact"
        ),
        contactNotes: String(
          recordGet(record, "Contact Notes", "contactNotes")
        ),
        messageLog,
        expectedDate: asDateOnly(recordGet(record, "expectedDate")),
        expectedAmount: recordGet(record, "expectedAmount"),
        monthRemarks: String(recordGet(record, "monthRemarks")),
        targetPaidManual: asBoolean(recordGet(record, "targetPaidManual")),
        createdAt: String(recordGet(record, "createdAt")),
        updatedAt: String(recordGet(record, "updatedAt")),
      } as unknown as Candidate;
    })
    .filter((c): c is Candidate => !!c);

  const history = historyRecords.map((record) => ({
    ...record,
    id: asNumber(record.id),
    candidateId: asNumber(record.candidateId),
    date: asDateOnly(record.date),
    amount: asNumber(record.amount),
  })) as unknown as PaymentHistory[];

  const settings = Object.fromEntries(
    settingRecords.map((record) => [
      String(record.key ?? ""),
      parseSetting(record.value),
    ])
  ) as Partial<CrmSettings>;
  if (settings.incentiveFrom) {
    settings.incentiveFrom = asDateOnly(settings.incentiveFrom);
  }
  if (settings.incentiveTo) {
    settings.incentiveTo = asDateOnly(settings.incentiveTo);
  }
  settings.whatsappTemplates = Object.fromEntries(
    sheetRecords(workbook.getWorksheet("WhatsAppTemplates")).map((record) => [
      String(record.name ?? ""),
      String(record.body ?? ""),
    ])
  ) as CrmSettings["whatsappTemplates"];
  settings.workflowRules = Object.fromEntries(
    sheetRecords(workbook.getWorksheet("WorkflowRules")).map((record) => [
      String(record.rule ?? ""),
      asBoolean(record.enabled),
    ])
  ) as unknown as CrmSettings["workflowRules"];
  settings.workflowLog = sheetRecords(
    workbook.getWorksheet("WorkflowLog")
  ).map((record) => ({
    id: asNumber(record.id),
    timestamp: String(record.timestamp ?? ""),
    rule: String(record.rule ?? ""),
    candidateId:
      typeof record.candidateId === "number"
        ? record.candidateId
        : String(record.candidateId ?? ""),
    candidateName: String(record.candidateName ?? ""),
    action: String(record.action ?? ""),
  }));
  settings.workflowState = Object.fromEntries(
    sheetRecords(workbook.getWorksheet("WorkflowState")).map((record) => [
      String(record.key ?? ""),
      String(record.value ?? ""),
    ])
  );

  const meta = Object.fromEntries(
    metaRecords.map((record) => [
      String(record.key ?? ""),
      String(record.value ?? ""),
    ])
  );

  return {
    version: meta.version || "3.0",
    exportedAt: meta.exportedAt || "",
    candidates,
    history,
    settings: settings as CrmSettings,
  };
}

export { EXCEL_MIME };
