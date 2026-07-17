import type { Assignee, Candidate, ContactMethod } from "./types";
import { money, parseMoney, parsePercent, phoneOf, getTotalPaid } from "./calc";
import { parseDate, fmtDateShort } from "./dates";
import { normalizeCandidate, parseInstallment } from "./normalize";

export function csvEscape(v: unknown): string {
  const s = String(v ?? "");
  return /[",\n\r\t,]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

export function normalizeHeader(h: string): string {
  return String(h || "")
    .toLowerCase()
    .replace(/[’']/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function parseDelimited(text: string): string[][] {
  text = String(text || "").replace(/^\ufeff/, "");
  const delim = text.split("\n")[0]?.includes("\t") ? "\t" : ",";
  const rows: string[][] = [];
  let row: string[] = [];
  let cur = "";
  let q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const nx = text[i + 1];
    if (ch === '"') {
      if (q && nx === '"') {
        cur += '"';
        i++;
      } else q = !q;
    } else if (ch === delim && !q) {
      row.push(cur);
      cur = "";
    } else if ((ch === "\n" || ch === "\r") && !q) {
      if (ch === "\r" && nx === "\n") i++;
      row.push(cur);
      cur = "";
      if (row.some((x) => String(x).trim() !== "")) rows.push(row);
      row = [];
    } else cur += ch;
  }
  row.push(cur);
  if (row.some((x) => String(x).trim() !== "")) rows.push(row);
  return rows;
}

function instToText(inst: Candidate["installments"][0]): string {
  if (!inst || !inst.amount) return "";
  return (
    String(inst.amount).trim() +
    (inst.date ? " " + fmtDateShort(inst.date) : "")
  );
}

function splitAmountPercent(text: string): { annual: number; pct: number } {
  const raw = String(text || "").trim();
  let pct = parsePercent(raw);
  let annual = 0;
  const slash = raw.split("/");
  if (slash.length >= 2) {
    annual = parseMoney(slash[0]);
    if (!pct) pct = parsePercent(slash.slice(1).join("/"));
  } else {
    annual = parseMoney(raw);
  }
  return { annual, pct };
}

export function exportCandidatesCsv(candidates: Candidate[]): string {
  const headers = [
    "P.O Month",
    "floor",
    "Total Service",
    "Terms.",
    "P.O.",
    "Amount and percentage",
    "Candidate's start date",
    "Candidate name",
    "Phone Number",
    "1st Installment",
    "2nd Installment",
    "3rd Installment",
    "4th Installment",
    "5th Installment",
    "6th Installment",
    "7th installment",
    "8th date",
    "9th date",
    "Assigned To",
    "Status",
    "Remarks",
    "Last Contact Date",
    "Next Follow-up Date",
    "Contact Method",
    "Contact Notes",
    "Paid Installments",
  ];
  const lines = [headers.map(csvEscape).join(",")];
  candidates.forEach((c) => {
    const row: unknown[] = [
      c.poMonth || "",
      c.floor || "",
      c.totalServiceFee || "",
      c.terms || "",
      c.po || "",
      (c.annualPackage || "") + "/" + (c.serviceFeePercent || 0) + "%",
      c.startDate || "",
      c.name || "",
      phoneOf(c),
    ];
    for (let i = 0; i < 9; i++) {
      const x = c.installments?.[i];
      row.push(x?.amount ? String(x.amount) + (x.date ? " " + x.date : "") : "");
    }
    row.push(
      c.assignedTo || "",
      c.status || "",
      c.remarks || "",
      c.lastContactDate || "",
      c.nextFollowUpDate || "",
      c.contactMethod || "",
      c.contactNotes || "",
      (c.installments || [])
        .map((i, idx) => (i.paid ? idx + 1 : null))
        .filter(Boolean)
        .join("|")
    );
    lines.push(row.map(csvEscape).join(","));
  });
  return lines.join("\n");
}

export function importSheetRows(
  text: string,
  existing: Candidate[]
): { candidates: Candidate[]; added: number; updated: number } {
  const rows = parseDelimited(text);
  if (rows.length < 2) throw new Error("No rows found");

  let headerIdx = 0;
  for (let i = 0; i < Math.min(rows.length, 10); i++) {
    const h = rows[i].map(normalizeHeader).join(" | ");
    if (h.includes("candidate") || h.includes("name") || h.includes("floor")) {
      headerIdx = i;
      break;
    }
  }

  const heads = rows[headerIdx].map(normalizeHeader);
  const idx = (names: string[]) => {
    for (const n of names) {
      const i = heads.findIndex((h) => h === n || h.includes(n));
      if (i >= 0) return i;
    }
    return -1;
  };

  const col = {
    floor: idx(["floor", "office floor"]),
    total: idx(["total service fees", "total service fee", "total service", "total"]),
    terms: idx(["terms"]),
    po: idx(["p o", "po"]),
    amountPct: idx([
      "amount and percentage",
      "amount percentage",
      "annual package",
      "package",
    ]),
    start: idx(["candidate start date", "start date", "candidates start date"]),
    name: idx(["candidate name", "name"]),
    phone: idx(["phone number", "phone", "mobile"]),
    assigned: idx(["assigned to", "assigned"]),
    status: idx(["status"]),
    remarks: idx(["remarks", "remark", "notes"]),
    poMonth: idx(["p o month", "po month", "month"]),
    last: idx(["last contact date"]),
    next: idx(["next follow up date", "next follow-up date"]),
    method: idx(["contact method"]),
    notes: idx(["contact notes"]),
    paid: idx(["paid installments"]),
  };

  const instCols: number[] = [];
  for (let n = 1; n <= 9; n++) {
    instCols.push(
      idx([
        n + "st installment",
        n + "nd installment",
        n + "rd installment",
        n + "th installment",
        "installment " + n,
        n + "th date",
        n + "st date",
        n + "nd date",
        n + "rd date",
      ])
    );
  }

  if (col.name < 0) throw new Error("Candidate name column missing");

  const candidates = existing.map((c) => ({ ...c }));
  let added = 0;
  let updated = 0;

  for (let rIdx = headerIdx + 1; rIdx < rows.length; rIdx++) {
    const row = rows[rIdx];
    const name = String(row[col.name] || "").trim();
    if (!name) continue;
    const po = col.po >= 0 ? String(row[col.po] || "").trim() : "";
    const phone = col.phone >= 0 ? String(row[col.phone] || "").trim() : "";

    let existingIdx = candidates.findIndex(
      (c) =>
        c.name.toLowerCase() === name.toLowerCase() &&
        String(c.po || "") === po
    );
    if (existingIdx < 0 && phone) {
      existingIdx = candidates.findIndex(
        (c) =>
          c.name.toLowerCase() === name.toLowerCase() &&
          phoneOf(c).replace(/\D/g, "") === phone.replace(/\D/g, "")
      );
    }
    if (existingIdx < 0) {
      existingIdx = candidates.findIndex(
        (c) => c.name.toLowerCase() === name.toLowerCase()
      );
    }

    const prev = existingIdx >= 0 ? candidates[existingIdx] : undefined;
    const amountPct =
      col.amountPct >= 0 ? String(row[col.amountPct] || "") : "";
    const { annual: parsedAnnual, pct: parsedPct } =
      splitAmountPercent(amountPct);
    let pct = parsedPct;
    let annual = parsedAnnual;
    const total = col.total >= 0 ? parseMoney(row[col.total]) : 0;
    if (!pct && prev) pct = Number(prev.serviceFeePercent) || 0;
    if (!annual && total && pct) annual = roundMoney(total * 100 / pct);
    if (!annual && prev) annual = Number(prev.annualPackage) || 0;

    const insts = Array.from({ length: 9 }, (_, i) =>
      prev?.installments?.[i]
        ? { ...prev.installments[i] }
        : {
            amount: "",
            date: "",
            paid: false,
            receipt: "",
            notes: "",
            paymentDate: "",
          }
    );
    instCols.forEach((ci, i) => {
      if (ci >= 0 && row[ci] !== undefined && String(row[ci]).trim() !== "") {
        const old = insts[i] || {};
        insts[i] = {
          ...old,
          ...parseInstallment(row[ci]),
          paid: old.paid || false,
          receipt: old.receipt || "",
          notes: old.notes || "",
          paymentDate: old.paymentDate || "",
        };
      }
    });

    if (col.paid >= 0) {
      const paid = new Set(
        String(row[col.paid] || "")
          .split("|")
          .map(Number)
      );
      insts.forEach((i, idx) => {
        if (paid.has(idx + 1)) {
          i.paid = true;
          i.paymentDate = i.paymentDate || i.date || "";
        }
      });
    }

    const candidate = normalizeCandidate({
      ...(prev || {}),
      name,
      po,
      phoneNumber: phone || prev?.phoneNumber || "",
      floor:
        col.floor >= 0
          ? String(row[col.floor] || "").trim()
          : prev?.floor || "",
      totalServiceFee: total || prev?.totalServiceFee || 0,
      annualPackage: annual,
      serviceFeePercent: pct,
      terms:
        col.terms >= 0
          ? String(row[col.terms] || "").trim()
          : prev?.terms || "",
      startDate:
        col.start >= 0
          ? parseDate(String(row[col.start] || "")) ||
            String(row[col.start] || "")
          : prev?.startDate || "",
      assignedTo: (col.assigned >= 0
        ? String(row[col.assigned] || "Yatin").trim()
        : prev?.assignedTo || "Yatin") as Assignee,
      status:
        col.status >= 0
          ? String(row[col.status] || "Active").trim()
          : prev?.status || "Active",
      remarks:
        col.remarks >= 0
          ? String(row[col.remarks] || "").trim()
          : prev?.remarks || "",
      poMonth:
        col.poMonth >= 0
          ? String(row[col.poMonth] || "").trim()
          : prev?.poMonth || "",
      lastContactDate:
        col.last >= 0
          ? String(row[col.last] || "").trim()
          : prev?.lastContactDate || "",
      nextFollowUpDate:
        col.next >= 0
          ? String(row[col.next] || "").trim()
          : prev?.nextFollowUpDate || "",
      contactMethod: (col.method >= 0
        ? String(row[col.method] || "No Contact").trim()
        : prev?.contactMethod || "No Contact") as ContactMethod,
      contactNotes:
        col.notes >= 0
          ? String(row[col.notes] || "").trim()
          : prev?.contactNotes || "",
      installments: insts,
    });

    if (prev && existingIdx >= 0) {
      candidates[existingIdx] = candidate;
      updated++;
    } else {
      candidates.push(candidate);
      added++;
    }
  }

  return { candidates, added, updated };
}

function roundMoney(n: number): number {
  return Math.round((Number(n) || 0) * 100) / 100;
}

export function downloadBlob(
  content: BlobPart,
  filename: string,
  type: string
) {
  const blob = content instanceof Blob ? content : new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export { money, getTotalPaid, instToText };
