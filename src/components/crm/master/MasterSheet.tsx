"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useCrm } from "../CrmProvider";
import { FiltersBar } from "../FiltersBar";
import {
  money,
  getTotalPaid,
  getRemaining,
  getLastPaymentDate,
  getNextDueDate,
  rowColorClass,
  fmtDate,
  fmtDateShort,
  exportCandidatesCsv,
  importSheetRows,
  downloadBlob,
  phoneOf,
  todayIso,
} from "@/lib/crm";
import type { Candidate } from "@/lib/crm/types";

const STATUS_OPTIONS = [
  "Active",
  "Fully Paid",
  "Run Away",
  "Job Lost",
  "Cancelled",
  "Refunded",
  "Closed",
  "Inactive",
  "No Response",
  "Payment Hold",
];

function instText(c: Candidate, idx: number): string {
  const i = c.installments[idx];
  if (!i?.amount) return "";
  return (
    String(i.amount) + (i.date ? " " + fmtDateShort(i.date) : "")
  );
}

function instStatus(i: Candidate["installments"][0]) {
  if (!i?.amount) return { label: "", color: "text-muted" };
  if (i.paid) return { label: "PAID", color: "text-success" };
  if (i.date && new Date(i.date + "T00:00:00") < new Date())
    return { label: "OVERDUE", color: "text-danger" };
  return { label: "DUE", color: "text-muted" };
}

export function MasterSheet() {
  const {
    filtered,
    candidates,
    updateMasterField,
    updateInstallment,
    togglePaid,
    deleteCandidate,
    editCandidate,
    duplicateLast,
    deleteAllCandidates,
    toast,
    setCandidates,
    queueSave,
    snapshot,
    bulkSelected,
    setBulkSelected,
    updateContactField,
    smartFilter,
    setSmartFilter,
    getRemaining: _gr,
  } = useCrm() as ReturnType<typeof useCrm> & {
    getRemaining?: typeof getRemaining;
  };

  const scrollRef = useRef<HTMLDivElement>(null);
  const [followupFilter, setFollowupFilter] = useState("");
  const [methodFilter, setMethodFilter] = useState("");
  const [fullscreen, setFullscreen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  let list = filtered();

  if (smartFilter) {
    const t = todayIso();
    if (smartFilter.type === "overdue") {
      list = list.filter((c) => {
        const n = getNextDueDate(c);
        return n && n < t && getRemaining(c) > 0;
      });
    } else if (smartFilter.type === "missingPhone") {
      list = list.filter((c) => !phoneOf(c) && c.status === "Active");
    } else if (smartFilter.type === "highBalance") {
      const amt = smartFilter.amount || 5000;
      list = list.filter((c) => getRemaining(c) >= amt);
    } else if (smartFilter.type === "focus") {
      list = list
        .filter((c) => getRemaining(c) > 0 && c.status === "Active")
        .sort((a, b) => {
          const da = getNextDueDate(a) || "9999";
          const db = getNextDueDate(b) || "9999";
          return da.localeCompare(db);
        });
    } else if (smartFilter.type === "duplicates") {
      const names = new Map<string, number>();
      list.forEach((c) => {
        const k = c.name.toLowerCase().trim();
        names.set(k, (names.get(k) || 0) + 1);
      });
      list = list.filter((c) => (names.get(c.name.toLowerCase().trim()) || 0) > 1);
    } else if (smartFilter.type === "missingData") {
      list = list.filter(
        (c) =>
          !phoneOf(c) ||
          !getNextDueDate(c) ||
          !c.totalServiceFee
      );
    }
  }

  if (followupFilter) {
    const t = todayIso();
    if (followupFilter === "overdue")
      list = list.filter(
        (c) => c.nextFollowUpDate && c.nextFollowUpDate < t
      );
    if (followupFilter === "today")
      list = list.filter((c) => c.nextFollowUpDate === t);
    if (followupFilter === "future")
      list = list.filter(
        (c) => c.nextFollowUpDate && c.nextFollowUpDate > t
      );
    if (followupFilter === "never")
      list = list.filter((c) => !c.nextFollowUpDate);
  }
  if (methodFilter)
    list = list.filter((c) => c.contactMethod === methodFilter);

  const PAGE_SIZE_OPTIONS = [25, 50, 100] as const;
  const [pageSize, setPageSize] = useState<(typeof PAGE_SIZE_OPTIONS)[number]>(50);
  const [page, setPage] = useState(0);

  const pageCount = Math.max(1, Math.ceil(list.length / pageSize));
  const pageList = list.slice(page * pageSize, page * pageSize + pageSize);

  useEffect(() => {
    setPage(0);
  }, [list.length, followupFilter, methodFilter, smartFilter?.type]);

  useEffect(() => {
    setPage((p) => Math.min(p, pageCount - 1));
  }, [pageCount]);

  const toggleSelect = (id: string, checked: boolean, shift = false) => {
    const next = new Set(bulkSelected);
    if (checked) next.add(id);
    else next.delete(id);
    setBulkSelected(next);
  };

  const handlePaste = useCallback(
    (e: React.ClipboardEvent, startId: number, startCol: number) => {
      const text = e.clipboardData.getData("text");
      if (!text.includes("\t") && !text.includes("\n")) return;
      e.preventDefault();
      snapshot();
      const rows = text.replace(/\r/g, "").split("\n").filter(Boolean);
      const ids = list.map((c) => c.id);
      const startRow = ids.indexOf(startId);
      if (startRow < 0) return;
      const fields = [
        "name",
        "phoneNumber",
        "assignedTo",
        "floor",
        "annualPackage",
        "serviceFeePercent",
        "terms",
        "po",
        "startDate",
        "status",
        "remarks",
        "poMonth",
      ];
      let next = [...candidates];
      rows.forEach((row, ri) => {
        const cols = row.split("\t");
        const id = ids[startRow + ri];
        if (!id) return;
        const ci = next.findIndex((c) => c.id === id);
        if (ci < 0) return;
        let c = { ...next[ci] };
        cols.forEach((val, di) => {
          const field = fields[startCol + di];
          if (!field) return;
          (c as Record<string, unknown>)[field] = val.trim();
        });
        next[ci] = { ...c } as Candidate;
      });
      // re-normalize via field updates
      next = next.map((c) => {
        const orig = candidates.find((x) => x.id === c.id);
        return orig === c ? c : require("@/lib/crm").normalizeCandidate(c);
      });
      setCandidates(next);
      queueSave();
      toast("Paste applied", "success");
    },
    [list, candidates, snapshot, setCandidates, queueSave, toast]
  );

  const exportCsv = () => {
    downloadBlob(
      exportCandidatesCsv(candidates),
      "careerus_master_po_" + todayIso() + ".csv",
      "text/csv;charset=utf-8"
    );
    toast("Master P.O exported", "success");
  };

  const importCsv = async (file?: File | null) => {
    if (!file) return;
    try {
      const text = await file.text();
      snapshot();
      const { candidates: next, added, updated } = importSheetRows(
        text,
        candidates
      );
      setCandidates(next);
      queueSave();
      toast(`Sheet import complete: ${added} added, ${updated} updated`, "success");
    } catch (err) {
      toast(
        "Sheet import failed: " +
          (err instanceof Error ? err.message : "error"),
        "error"
      );
    }
  };

  const cols = useMemo(
    () => [
      { key: "name", label: "Name", freeze: "freeze-name" },
      { key: "phoneNumber", label: "Phone", freeze: "freeze-phone" },
      { key: "totalServiceFee", label: "Total Fee", freeze: "freeze-total", calc: true },
      { key: "paid", label: "Paid", freeze: "freeze-paid", calc: true },
      { key: "remaining", label: "Remaining", freeze: "freeze-remaining", calc: true },
      { key: "poMonth", label: "P.O Month" },
      { key: "installmentCount", label: "Inst #" },
      { key: "assignedTo", label: "Assigned" },
      { key: "floor", label: "Floor" },
      { key: "annualPackage", label: "Annual Pkg" },
      { key: "serviceFeePercent", label: "Fee %" },
      { key: "terms", label: "Terms" },
      { key: "po", label: "P.O" },
      { key: "startDate", label: "Start Date" },
      { key: "status", label: "Status" },
      { key: "remarks", label: "Remarks" },
      ...Array.from({ length: 9 }, (_, i) => ({
        key: "inst" + i,
        label: i + 1 + (i === 0 ? "st" : i === 1 ? "nd" : i === 2 ? "rd" : "th") + " Installment",
        inst: i,
      })),
      { key: "lastPay", label: "Last Pay", calc: true },
      { key: "nextDue", label: "Next Due", calc: true },
      { key: "lastContactDate", label: "Last Contact" },
      { key: "nextFollowUpDate", label: "Next Follow-up" },
      { key: "contactMethod", label: "Contact Method" },
      { key: "actions", label: "Actions", calc: true },
    ],
    []
  );

  void _gr;

  const shellCls = fullscreen
    ? "fixed inset-0 z-[3000] flex flex-col bg-background p-4"
    : "";

  return (
    <div className={shellCls}>
      <FiltersBar />
      {smartFilter && (
        <div className="mb-3 flex items-center justify-between rounded-[var(--radius)] border border-primary/30 bg-primary/5 px-4 py-2 text-sm">
          <span>
            ✨ Smart filter active · {list.length} matching candidates
          </span>
          <button
            type="button"
            className="rounded border border-border bg-secondary px-3 py-1 text-xs"
            onClick={() => setSmartFilter(null)}
          >
            Clear Smart Filter
          </button>
        </div>
      )}
      <div className="mb-3 flex flex-wrap items-center gap-2 rounded-[15px] border border-border bg-secondary/50 px-3 py-2.5">
        <span className="text-xs text-muted">Follow-up:</span>
        <select
          className="rounded border border-border bg-input px-2 py-1 text-sm"
          value={followupFilter}
          onChange={(e) => setFollowupFilter(e.target.value)}
        >
          <option value="">All</option>
          <option value="overdue">Overdue</option>
          <option value="today">Today</option>
          <option value="future">Future</option>
          <option value="never">Not Set</option>
        </select>
        <span className="text-xs text-muted">Contact Method:</span>
        <select
          className="rounded border border-border bg-input px-2 py-1 text-sm"
          value={methodFilter}
          onChange={(e) => setMethodFilter(e.target.value)}
        >
          <option value="">All</option>
          {["Call", "WhatsApp", "Email", "In-Person", "No Contact"].map((v) => (
            <option key={v}>{v}</option>
          ))}
        </select>
        <button
          type="button"
          className="rounded border border-border bg-secondary px-3 py-1 text-xs"
          onClick={() => {
            setFollowupFilter("");
            setMethodFilter("");
          }}
        >
          Clear Contact Filters
        </button>
      </div>

      <div className="overflow-hidden rounded-[var(--radius)] border border-border bg-card">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-5 py-4">
          <div>
            <div className="text-base font-semibold">Master P.O Sheet</div>
            <div className="mt-1 text-xs text-muted">
              Excel-style grid: edit cells, paste from Sheets, TAB/arrows to
              navigate. Data saves to MongoDB.
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-border bg-secondary px-2.5 py-1 text-xs text-muted">
              Showing {pageList.length} of {list.length} · Page {page + 1}/{pageCount}
            </span>
            <button
              type="button"
              className="rounded border border-border bg-secondary px-3 py-1.5 text-xs disabled:opacity-50"
              disabled={page <= 0}
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              aria-label="Previous page"
            >
              ◀
            </button>
            <button
              type="button"
              className="rounded border border-border bg-secondary px-3 py-1.5 text-xs disabled:opacity-50"
              disabled={page >= pageCount - 1}
              onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
              aria-label="Next page"
            >
              ▶
            </button>
            <label className="flex items-center gap-1 text-xs text-muted">
              Rows
              <select
                className="rounded border border-border bg-input px-2 py-1 text-xs text-foreground"
                value={pageSize}
                onChange={(e) => {
                  const next = Number(e.target.value) as (typeof PAGE_SIZE_OPTIONS)[number];
                  setPageSize(next);
                  setPage(0);
                }}
              >
                {PAGE_SIZE_OPTIONS.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              className="rounded border border-border bg-secondary px-3 py-1.5 text-xs"
              onClick={() => fileRef.current?.click()}
            >
              📥 Import CSV
            </button>
            <button
              type="button"
              className="rounded border border-border bg-secondary px-3 py-1.5 text-xs"
              onClick={exportCsv}
            >
              📤 Export CSV
            </button>
            <button
              type="button"
              className="rounded border border-border bg-secondary px-3 py-1.5 text-xs"
              onClick={duplicateLast}
            >
              📋 Duplicate Last
            </button>
            <button
              type="button"
              className="rounded bg-danger px-3 py-1.5 text-xs text-white"
              onClick={deleteAllCandidates}
            >
              🗑️ Delete All
            </button>
            <button
              type="button"
              className="rounded border border-border bg-secondary px-3 py-1.5 text-xs"
              onClick={() => setFullscreen((f) => !f)}
            >
              {fullscreen ? "Exit Fullscreen" : "Fullscreen"}
            </button>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,.tsv,.txt"
              className="hidden"
              onChange={(e) => importCsv(e.target.files?.[0])}
            />
          </div>
        </div>
        <div
          ref={scrollRef}
          id="masterScroll"
          className="table-scroll overflow-auto"
          style={{ maxHeight: fullscreen ? "calc(100vh - 160px)" : "calc(100vh - 280px)" }}
        >
          <table className="excel-grid">
            <thead>
              <tr>
                <th className="row-head">#</th>
                <th className="freeze-check">
                  <input
                    type="checkbox"
                    onChange={(e) => {
                      const next = new Set<string>();
                      if (e.target.checked)
                        list.forEach((c) => next.add(String(c.id)));
                      setBulkSelected(next);
                    }}
                  />
                </th>
                {cols.map((c) => (
                  <th
                    key={c.key}
                    className={
                      "freeze" in c && c.freeze
                        ? `sticky-priority ${c.freeze}`
                        : ""
                    }
                  >
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pageList.map((c, rowIndex) => (
                <tr
                  key={c.id}
                  className={`${rowColorClass(c)} ${
                    bulkSelected.has(String(c.id)) ? "outline outline-1 outline-primary/40" : ""
                  }`}
                  data-id={c.id}
                >
                  <td className="row-head">{page * pageSize + rowIndex + 1}</td>
                  <td className="freeze-check">
                    <input
                      type="checkbox"
                      checked={bulkSelected.has(String(c.id))}
                      onChange={(e) =>
                        toggleSelect(String(c.id), e.target.checked)
                      }
                    />
                  </td>
                  <td className="freeze-name sticky-priority important-col">
                    <input
                      className="sheet-cell name-priority"
                      value={c.name}
                      onChange={(e) =>
                        updateMasterField(c.id, "name", e.target.value)
                      }
                      onPaste={(e) => handlePaste(e, c.id, 0)}
                    />
                  </td>
                  <td className="freeze-phone sticky-priority">
                    <input
                      className="sheet-cell phone-cell"
                      value={c.phoneNumber}
                      onChange={(e) =>
                        updateMasterField(c.id, "phoneNumber", e.target.value)
                      }
                    />
                  </td>
                  <td className="freeze-total sticky-priority calc-cell">
                    <span className="font-bold text-primary">
                      {money(c.totalServiceFee)}
                    </span>
                  </td>
                  <td className="freeze-paid sticky-priority calc-cell">
                    <span className="font-bold text-success">
                      {money(getTotalPaid(c))}
                    </span>
                  </td>
                  <td className="freeze-remaining sticky-priority calc-cell">
                    <span
                      className={
                        getRemaining(c) > 0
                          ? "font-bold text-danger"
                          : "font-bold text-success"
                      }
                    >
                      {money(getRemaining(c))}
                    </span>
                  </td>
                  <td>
                    <input
                      className="sheet-cell"
                      value={c.poMonth}
                      onChange={(e) =>
                        updateMasterField(c.id, "poMonth", e.target.value)
                      }
                    />
                  </td>
                  <td>
                    <input
                      className="sheet-cell"
                      value={c.installmentCount || ""}
                      onChange={(e) =>
                        updateMasterField(
                          c.id,
                          "installmentCount",
                          e.target.value
                        )
                      }
                    />
                  </td>
                  <td>
                    <select
                      className="sheet-cell"
                      value={c.assignedTo}
                      onChange={(e) =>
                        updateMasterField(c.id, "assignedTo", e.target.value)
                      }
                    >
                      <option>Yatin</option>
                      <option>Jayraj</option>
                    </select>
                  </td>
                  <td>
                    <input
                      className="sheet-cell"
                      value={c.floor}
                      onChange={(e) =>
                        updateMasterField(c.id, "floor", e.target.value)
                      }
                    />
                  </td>
                  <td>
                    <input
                      className="sheet-cell"
                      value={c.annualPackage || ""}
                      onChange={(e) =>
                        updateMasterField(c.id, "annualPackage", e.target.value)
                      }
                    />
                  </td>
                  <td>
                    <input
                      className="sheet-cell"
                      value={c.serviceFeePercent || ""}
                      onChange={(e) =>
                        updateMasterField(
                          c.id,
                          "serviceFeePercent",
                          e.target.value
                        )
                      }
                    />
                  </td>
                  <td>
                    <input
                      className="sheet-cell"
                      value={c.terms}
                      onChange={(e) =>
                        updateMasterField(c.id, "terms", e.target.value)
                      }
                    />
                  </td>
                  <td>
                    <input
                      className="sheet-cell"
                      value={c.po}
                      onChange={(e) =>
                        updateMasterField(c.id, "po", e.target.value)
                      }
                    />
                  </td>
                  <td>
                    <input
                      className="sheet-cell"
                      value={c.startDate}
                      onChange={(e) =>
                        updateMasterField(c.id, "startDate", e.target.value)
                      }
                      placeholder="YYYY-MM-DD"
                    />
                  </td>
                  <td>
                    <select
                      className="sheet-cell"
                      value={c.status}
                      onChange={(e) =>
                        updateMasterField(c.id, "status", e.target.value)
                      }
                    >
                      {[...new Set([c.status, ...STATUS_OPTIONS])].map((s) => (
                        <option key={s}>{s}</option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <textarea
                      className="sheet-cell remarks-editor"
                      value={c.remarks}
                      onChange={(e) =>
                        updateMasterField(c.id, "remarks", e.target.value)
                      }
                    />
                  </td>
                  {Array.from({ length: 9 }, (_, idx) => {
                    const st = instStatus(c.installments[idx]);
                    return (
                      <td key={idx} className="inst-col">
                        <div className="inst-cell">
                          <div className="inst-row">
                            <input
                              className="sheet-cell"
                              type="text"
                              defaultValue={instText(c, idx)}
                              key={c.id + "-" + idx + "-" + instText(c, idx)}
                              placeholder="1500 14 Jan"
                              onBlur={(e) =>
                                updateInstallment(c.id, idx, e.target.value)
                              }
                            />
                            <input
                              type="checkbox"
                              checked={!!c.installments[idx]?.paid}
                              onChange={(e) =>
                                togglePaid(c.id, idx, e.target.checked)
                              }
                            />
                          </div>
                          {st.label ? (
                            <div className={`inst-status ${st.color}`}>
                              {st.label}
                            </div>
                          ) : null}
                        </div>
                      </td>
                    );
                  })}
                  <td className="calc-cell">{fmtDate(getLastPaymentDate(c))}</td>
                  <td className="calc-cell">{fmtDate(getNextDueDate(c))}</td>
                  <td>
                    <input
                      type="date"
                      className="sheet-cell"
                      value={c.lastContactDate || ""}
                      onChange={(e) =>
                        updateContactField(
                          c.id,
                          "lastContactDate",
                          e.target.value
                        )
                      }
                    />
                  </td>
                  <td>
                    <input
                      type="date"
                      className={`sheet-cell ${
                        !c.nextFollowUpDate
                          ? "text-danger"
                          : c.nextFollowUpDate < todayIso()
                            ? "text-danger"
                            : c.nextFollowUpDate === todayIso()
                              ? "text-warning"
                              : "text-success"
                      }`}
                      value={c.nextFollowUpDate || ""}
                      onChange={(e) =>
                        updateContactField(
                          c.id,
                          "nextFollowUpDate",
                          e.target.value
                        )
                      }
                    />
                  </td>
                  <td>
                    <select
                      className="sheet-cell"
                      value={c.contactMethod}
                      onChange={(e) =>
                        updateContactField(
                          c.id,
                          "contactMethod",
                          e.target.value
                        )
                      }
                    >
                      {[
                        "Call",
                        "WhatsApp",
                        "Email",
                        "In-Person",
                        "No Contact",
                      ].map((v) => (
                        <option key={v}>{v}</option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <button
                      type="button"
                      className="mr-1 rounded border border-border bg-secondary px-2 py-1 text-xs"
                      onClick={() => editCandidate(c.id)}
                    >
                      ✏️
                    </button>
                    <button
                      type="button"
                      className="rounded bg-danger px-2 py-1 text-xs text-white"
                      onClick={() => deleteCandidate(c.id)}
                    >
                      🗑️
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {bulkSelected.size > 0 && (
        <BulkBar list={list} />
      )}
    </div>
  );
}

function BulkBar({ list }: { list: Candidate[] }) {
  const {
    bulkSelected,
    setBulkSelected,
    candidates,
    setCandidates,
    history,
    setHistory,
    snapshot,
    queueSave,
    toast,
    normalizeCandidate: _n,
  } = useCrm() as ReturnType<typeof useCrm> & {
    normalizeCandidate?: typeof import("@/lib/crm").normalizeCandidate;
  };
  const { normalizeCandidate } = require("@/lib/crm") as typeof import("@/lib/crm");
  const { newId } = require("@/lib/crm") as typeof import("@/lib/crm");
  const { addDays, todayIso } = require("@/lib/crm") as typeof import("@/lib/crm");
  const { exportCandidatesCsv, downloadBlob } = require("@/lib/crm") as typeof import("@/lib/crm");

  void list;
  void _n;

  const selected = candidates.filter((c) =>
    bulkSelected.has(String(c.id))
  );

  const apply = (fn: (c: Candidate) => Candidate) => {
    snapshot();
    setCandidates(
      candidates.map((c) =>
        bulkSelected.has(String(c.id))
          ? normalizeCandidate(fn(c))
          : c
      )
    );
    queueSave();
  };

  return (
    <div className="fixed bottom-4 left-1/2 z-[3900] flex w-[min(1180px,calc(100vw-28px))] -translate-x-1/2 flex-wrap items-center gap-2 rounded-[20px] border border-border bg-card px-3.5 py-3 shadow-2xl">
      <div className="mr-auto font-black">{bulkSelected.size} candidates selected</div>
      <select
        className="rounded border border-border bg-input px-2 py-1 text-sm"
        defaultValue=""
        onChange={(e) => {
          if (!e.target.value) return;
          if (!confirm(`Apply status = ${e.target.value}?`)) return;
          apply((c) => ({
            ...c,
            status: e.target.value,
            nextFollowUpDate: ["Run Away", "No Response"].includes(
              e.target.value
            )
              ? addDays(todayIso(), 7)
              : c.nextFollowUpDate,
          }));
          e.target.value = "";
          toast("Bulk update completed", "success");
        }}
      >
        <option value="">Change Status</option>
        {[
          "Active",
          "Fully Paid",
          "Run Away",
          "No Response",
          "Job Lost",
          "Cancelled",
          "Refunded",
          "Closed",
          "Inactive",
        ].map((v) => (
          <option key={v}>{v}</option>
        ))}
      </select>
      <select
        className="rounded border border-border bg-input px-2 py-1 text-sm"
        defaultValue=""
        onChange={(e) => {
          if (!e.target.value) return;
          apply((c) => ({
            ...c,
            assignedTo: e.target.value as "Yatin" | "Jayraj",
          }));
          e.target.value = "";
          toast("Bulk update completed", "success");
        }}
      >
        <option value="">Change Assigned</option>
        <option>Yatin</option>
        <option>Jayraj</option>
      </select>
      <button
        type="button"
        className="rounded border border-border bg-secondary px-3 py-1.5 text-xs"
        onClick={() => {
          downloadBlob(
            exportCandidatesCsv(selected),
            "careerus_selected_" + todayIso() + ".csv",
            "text/csv;charset=utf-8"
          );
          toast("Selected candidates exported", "success");
        }}
      >
        Export Selected
      </button>
      <button
        type="button"
        className="rounded bg-danger px-3 py-1.5 text-xs text-white"
        onClick={() => {
          if (
            !confirm(`Delete ${selected.length} selected?`) ||
            !confirm("Final confirmation?")
          )
            return;
          snapshot();
          const ids = new Set([...bulkSelected]);
          setCandidates(candidates.filter((c) => !ids.has(String(c.id))));
          setHistory(history.filter((h) => !ids.has(String(h.candidateId))));
          setBulkSelected(new Set());
          queueSave();
          toast("Selected candidates deleted", "success");
        }}
      >
        Delete Selected
      </button>
      <button
        type="button"
        className="rounded border border-border bg-secondary px-3 py-1.5 text-xs"
        onClick={() => setBulkSelected(new Set())}
      >
        Clear
      </button>
      <button
        type="button"
        className="rounded bg-success px-3 py-1.5 text-xs text-white"
        onClick={() => {
          if (!confirm("Mark every entered installment as paid?")) return;
          snapshot();
          const h = [...history];
          setCandidates(
            candidates.map((c) => {
              if (!bulkSelected.has(String(c.id))) return c;
              const installments = c.installments.map((i, idx) => {
                if (i.amount && !i.paid) {
                  h.push({
                    id: newId(),
                    candidateId: c.id,
                    candidateName: c.name,
                    assignedTo: c.assignedTo,
                    floor: c.floor,
                    date: i.date || todayIso(),
                    amount: Number(i.amount) || 0,
                    type: "Payment",
                    notes: "Bulk mark paid - installment " + (idx + 1),
                    timestamp: new Date().toISOString(),
                  });
                  return {
                    ...i,
                    paid: true,
                    paymentDate: i.paymentDate || i.date || todayIso(),
                  };
                }
                return i;
              });
              return normalizeCandidate({ ...c, installments });
            })
          );
          setHistory(h);
          queueSave();
          toast("All selected installments marked paid", "success");
        }}
      >
        Mark All Paid
      </button>
    </div>
  );
}
