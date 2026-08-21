"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useCrm } from "../CrmProvider";
import { FiltersBar } from "../FiltersBar";
import { FullscreenExitFab } from "../shared";
import {
  money,
  getRemaining,
  getNextDueDate,
  rowColorClass,
  fmtDate,
  exportCandidatesCsv,
  importSheetRows,
  downloadBlob,
  phoneOf,
  todayIso,
  normalizeCandidate,
} from "@/lib/crm";
import type { Candidate } from "@/lib/crm/types";

function instText(c: Candidate, idx: number): string {
  const i = c.installments[idx];
  if (!i?.amount) return "";
  return String(i.amount) + (i.date ? " " + fmtDate(i.date) : "");
}

function instStatus(i: Candidate["installments"][0]) {
  if (!i?.amount) return { label: "", color: "text-muted" };
  if (i.paid) return { label: "PAID", color: "text-success" };
  if (i.date && new Date(i.date + "T00:00:00") < new Date())
    return { label: "OVERDUE", color: "text-danger" };
  return { label: "DUE", color: "text-muted" };
}

// Visible sheet columns, in the exact order requested:
// Month | Total | Terms (=Assigned To) | P.O. | Start Date | Candidate Name | 1st..9th date
// Every other candidate field (phone, status, remarks, floor, fee %, contact
// info, real "terms" text, etc.) still exists on the record and is still
// computed/edited via the row's Edit action - it's just not shown inline here.
type DataCol = {
  key: string;
  label: string;
  editable: boolean;
  getText: (c: Candidate) => string;
};

const DATA_COLS: DataCol[] = [
  { key: "poMonth", label: "Month", editable: true, getText: (c) => c.poMonth || "" },
  {
    key: "totalServiceFee",
    label: "Total",
    editable: false,
    getText: (c) => (c.totalServiceFee ? String(c.totalServiceFee) : ""),
  },
  { key: "assignedTo", label: "Terms", editable: true, getText: (c) => c.assignedTo || "" },
  { key: "po", label: "P.O.", editable: true, getText: (c) => c.po || "" },
  { key: "startDate", label: "Start Date", editable: true, getText: (c) => c.startDate || "" },
  { key: "name", label: "Candidate Name", editable: true, getText: (c) => c.name || "" },
  ...Array.from({ length: 9 }, (_, i) => ({
    key: "inst" + i,
    label:
      i + 1 + (i === 0 ? "st" : i === 1 ? "nd" : i === 2 ? "rd" : "th") + " date",
    editable: false,
    getText: (c: Candidate) => {
      const inst = c.installments[i];
      if (!inst?.amount) return "";
      return String(inst.amount) + (inst.date ? " " + inst.date : "");
    },
  })),
];

type CellPos = { row: number; col: number };
type Rect = { r0: number; r1: number; c0: number; c1: number };

export function MasterSheet() {
  const {
    filtered,
    candidates,
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

  useEffect(() => {
    if (!fullscreen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setFullscreen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [fullscreen]);

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
        (c) => !phoneOf(c) || !getNextDueDate(c) || !c.totalServiceFee
      );
    }
  }

  if (followupFilter) {
    const t = todayIso();
    if (followupFilter === "overdue")
      list = list.filter((c) => c.nextFollowUpDate && c.nextFollowUpDate < t);
    if (followupFilter === "today")
      list = list.filter((c) => c.nextFollowUpDate === t);
    if (followupFilter === "future")
      list = list.filter((c) => c.nextFollowUpDate && c.nextFollowUpDate > t);
    if (followupFilter === "never")
      list = list.filter((c) => !c.nextFollowUpDate);
  }
  if (methodFilter)
    list = list.filter((c) => c.contactMethod === methodFilter);

  const toggleSelect = (id: string, checked: boolean) => {
    const next = new Set(bulkSelected);
    if (checked) next.add(id);
    else next.delete(id);
    setBulkSelected(next);
  };

  // ---- Google-Sheets-style range selection ----
  // `ranges` holds ranges committed by earlier Ctrl/Cmd-clicks; the range
  // currently being drawn (liveAnchor..liveFocus) is kept separate so it can
  // be extended by Shift-click/drag without disturbing the committed ones.
  const [ranges, setRanges] = useState<Rect[]>([]);
  const [liveAnchor, setLiveAnchor] = useState<CellPos | null>(null);
  const [liveFocus, setLiveFocus] = useState<CellPos | null>(null);
  const draggingRef = useRef(false);
  const dragModeRef = useRef<"cell" | "row" | "col">("cell");

  useEffect(() => {
    const up = () => {
      draggingRef.current = false;
    };
    window.addEventListener("mouseup", up);
    return () => window.removeEventListener("mouseup", up);
  }, []);

  // Clear selection if the visible row set changes size underneath it
  // (adjust state during render instead of an effect, per React's guidance
  // for resetting state in response to a prop/derived-value change).
  const [prevListLength, setPrevListLength] = useState(list.length);
  if (prevListLength !== list.length) {
    setPrevListLength(list.length);
    if (ranges.length || liveAnchor || liveFocus) {
      setRanges([]);
      setLiveAnchor(null);
      setLiveFocus(null);
    }
  }

  const liveRect: Rect | null =
    liveAnchor && liveFocus
      ? {
          r0: Math.min(liveAnchor.row, liveFocus.row),
          r1: Math.max(liveAnchor.row, liveFocus.row),
          c0: Math.min(liveAnchor.col, liveFocus.col),
          c1: Math.max(liveAnchor.col, liveFocus.col),
        }
      : null;
  const allRects = useMemo(
    () => (liveRect ? [...ranges, liveRect] : ranges),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ranges, liveAnchor, liveFocus]
  );
  const hasSelection = allRects.length > 0;

  const isCellSelected = (row: number, col: number) =>
    allRects.some(
      (r) => row >= r.r0 && row <= r.r1 && col >= r.c0 && col <= r.c1
    );

  const commitLiveRange = () => {
    if (liveRect) setRanges((prev) => [...prev, liveRect]);
  };

  const beginCellSelect = (row: number, col: number, e: React.MouseEvent) => {
    dragModeRef.current = "cell";
    draggingRef.current = true;
    if (e.ctrlKey || e.metaKey) {
      commitLiveRange();
      setLiveAnchor({ row, col });
      setLiveFocus({ row, col });
    } else if (e.shiftKey && liveAnchor) {
      setLiveFocus({ row, col });
    } else {
      setRanges([]);
      setLiveAnchor({ row, col });
      setLiveFocus({ row, col });
    }
  };
  const extendCellSelect = (row: number, col: number) => {
    if (draggingRef.current && dragModeRef.current === "cell")
      setLiveFocus({ row, col });
  };

  const beginRowSelect = (row: number, e: React.MouseEvent) => {
    dragModeRef.current = "row";
    draggingRef.current = true;
    const lastCol = DATA_COLS.length - 1;
    if (e.ctrlKey || e.metaKey) {
      commitLiveRange();
      setLiveAnchor({ row, col: 0 });
      setLiveFocus({ row, col: lastCol });
    } else if (e.shiftKey && liveAnchor) {
      setLiveAnchor({ row: liveAnchor.row, col: 0 });
      setLiveFocus({ row, col: lastCol });
    } else {
      setRanges([]);
      setLiveAnchor({ row, col: 0 });
      setLiveFocus({ row, col: lastCol });
    }
  };
  const extendRowSelect = (row: number) => {
    if (draggingRef.current && dragModeRef.current === "row")
      setLiveFocus({ row, col: DATA_COLS.length - 1 });
  };

  const beginColSelect = (col: number, e: React.MouseEvent) => {
    dragModeRef.current = "col";
    draggingRef.current = true;
    const lastRow = list.length - 1;
    if (e.ctrlKey || e.metaKey) {
      commitLiveRange();
      setLiveAnchor({ row: 0, col });
      setLiveFocus({ row: lastRow, col });
    } else if (e.shiftKey && liveAnchor) {
      setLiveAnchor({ row: 0, col: liveAnchor.col });
      setLiveFocus({ row: lastRow, col });
    } else {
      setRanges([]);
      setLiveAnchor({ row: 0, col });
      setLiveFocus({ row: lastRow, col });
    }
  };
  const extendColSelect = (col: number) => {
    if (draggingRef.current && dragModeRef.current === "col")
      setLiveFocus({ row: list.length - 1, col });
  };

  // Native `copy`/`paste` clipboard events only fire when the browser has
  // something of its own to copy (a real text selection) or an editable
  // element with a selection focused. Clicking a cell to "select" it in the
  // sheet sense doesn't create that, so Ctrl+C would silently do nothing.
  // We drive both directly through the Clipboard API instead, from a
  // keydown listener and from the toolbar Copy button.
  const rectsToTsv = useCallback(
    (rects: Rect[]) => {
      if (!rects.length) return "";
      const rowSet = new Set<number>();
      const colSet = new Set<number>();
      rects.forEach((r) => {
        for (let i = r.r0; i <= r.r1; i++) rowSet.add(i);
        for (let j = r.c0; j <= r.c1; j++) colSet.add(j);
      });
      const rows = [...rowSet].sort((a, b) => a - b);
      const cols = [...colSet].sort((a, b) => a - b);
      const inSelection = (r: number, c: number) =>
        rects.some((rect) => r >= rect.r0 && r <= rect.r1 && c >= rect.c0 && c <= rect.c1);
      return rows
        .map((r) => {
          const cand = list[r];
          if (!cand) return "";
          return cols
            .map((c) => (inSelection(r, c) ? DATA_COLS[c].getText(cand) : ""))
            .join("\t");
        })
        .join("\n");
    },
    [list]
  );

  const copySelection = useCallback(() => {
    if (!allRects.length) return;
    const text = rectsToTsv(allRects);
    navigator.clipboard.writeText(text).then(
      () => toast("Selection copied", "success"),
      () => toast("Copy failed - clipboard permission blocked", "error")
    );
  }, [allRects, rectsToTsv, toast]);

  const pasteAnchor = (): CellPos | null => {
    if (!allRects.length) return null;
    const r0 = Math.min(...allRects.map((r) => r.r0));
    const c0 = Math.min(...allRects.map((r) => r.c0));
    return { row: r0, col: c0 };
  };

  const applyPasteText = useCallback(
    (text: string, anchor: CellPos) => {
      if (!text.includes("\t") && !text.includes("\n")) return false;
      const startCandidate = list[anchor.row];
      if (!startCandidate) return false;
      snapshot();
      const ids = list.map((c) => c.id);
      const startRow = ids.indexOf(startCandidate.id);
      if (startRow < 0) return false;
      const rows = text.replace(/\r/g, "").split("\n").filter(Boolean);
      let next = [...candidates];
      rows.forEach((rowText, ri) => {
        const id = ids[startRow + ri];
        if (!id) return;
        const ci = next.findIndex((c) => c.id === id);
        if (ci < 0) return;
        const c = { ...next[ci] };
        const cols = rowText.split("\t");
        cols.forEach((val, ci2) => {
          const colDef = DATA_COLS[anchor.col + ci2];
          if (!colDef || !colDef.editable) return;
          (c as Record<string, unknown>)[colDef.key] = val.trim();
        });
        next[ci] = c as Candidate;
      });
      next = next.map((c) => {
        const orig = candidates.find((x) => x.id === c.id);
        return orig === c ? c : normalizeCandidate(c);
      });
      setCandidates(next);
      queueSave();
      toast("Paste applied", "success");
      return true;
    },
    [list, candidates, snapshot, setCandidates, queueSave, toast]
  );

  // Not memoized: it closes over `allRects` via `pasteAnchor`, which changes
  // on every selection update, so a fresh function each render is simplest.
  const handlePaste = (e: React.ClipboardEvent) => {
    const text = e.clipboardData.getData("text");
    const anchor = pasteAnchor();
    if (!anchor) return;
    if (applyPasteText(text, anchor)) e.preventDefault();
  };

  // Fallback for Ctrl/Cmd+C and Ctrl/Cmd+V when focus isn't in a native
  // text selection - covers clicking a cell (or a whole row/column header)
  // and pressing the shortcut, which is the normal sheet workflow.
  useEffect(() => {
    const isTypingWithSelection = () => {
      const el = document.activeElement as HTMLInputElement | null;
      if (!el || !("selectionStart" in el)) return false;
      return el.selectionStart !== el.selectionEnd;
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      const key = e.key.toLowerCase();
      if (key === "c") {
        if (!hasSelection || isTypingWithSelection()) return;
        copySelection();
      } else if (key === "v") {
        const anchor = pasteAnchor();
        if (!anchor) return;
        navigator.clipboard
          .readText()
          .then((text) => applyPasteText(text, anchor))
          .catch(() => {
            // Clipboard read blocked (permissions) - the native onPaste
            // handler on the grid still covers Ctrl+V while focused in
            // an editable cell.
          });
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasSelection, allRects, copySelection, applyPasteText]);

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

  void _gr;

  const shellCls = fullscreen
    ? "fixed inset-0 z-[3000] flex flex-col bg-background p-4"
    : "";

  return (
    <div className={shellCls}>
      {!fullscreen && (
        <>
          <FiltersBar>
            <span className="mx-1 hidden h-6 w-px bg-border sm:block" />
            <label className="filter-group">
              <span className="filter-label">Follow-up</span>
              <select
                value={followupFilter}
                onChange={(e) => setFollowupFilter(e.target.value)}
              >
                <option value="">All</option>
                <option value="overdue">Overdue</option>
                <option value="today">Today</option>
                <option value="future">Future</option>
                <option value="never">Not Set</option>
              </select>
            </label>
            <label className="filter-group">
              <span className="filter-label">Contact Method</span>
              <select
                value={methodFilter}
                onChange={(e) => setMethodFilter(e.target.value)}
              >
                <option value="">All</option>
                {["Call", "WhatsApp", "Email", "In-Person", "No Contact"].map(
                  (v) => (
                    <option key={v}>{v}</option>
                  )
                )}
              </select>
            </label>
            {(followupFilter || methodFilter) && (
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => {
                  setFollowupFilter("");
                  setMethodFilter("");
                }}
              >
                Clear Contact Filters
              </button>
            )}
          </FiltersBar>
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
        </>
      )}
      <FullscreenExitFab
        fullscreen={fullscreen}
        onExit={() => setFullscreen(false)}
      />
      <div
        className={`overflow-hidden rounded-[var(--radius)] border border-border bg-card ${
          fullscreen ? "flex min-h-0 flex-1 flex-col" : ""
        }`}
      >
        {!fullscreen && (
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-5 py-4">
            <div>
              <div className="text-base font-semibold">Master P.O Sheet</div>
              <div className="mt-1 text-xs text-muted">
                Sheet-style grid: click a cell (or drag across cells) to select
                a range, Shift+click/drag to extend it, Ctrl/Cmd+click to add
                another row/column/range, Ctrl/Cmd+C to copy, Ctrl/Cmd+V to
                paste - just like pasting into a Google Sheet. Click or drag
                across row numbers / column headers to select whole
                rows/columns. To type a single value (or edit installments,
                phone, status, remarks, contact info, etc.) use ✏️ Edit. Data
                saves to MongoDB.
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-border bg-secondary px-2.5 py-1 text-xs text-muted">
                {list.length} candidates
              </span>
              <button
                type="button"
                className="rounded border border-border bg-secondary px-3 py-1.5 text-xs disabled:opacity-50"
                disabled={!hasSelection}
                onClick={copySelection}
                title="Copy the selected cell range (or Ctrl/Cmd+C)"
              >
                📄 Copy Selection
              </button>
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
        )}
        <div
          ref={scrollRef}
          id="masterScroll"
          className={`table-scroll overflow-auto ${fullscreen ? "flex-1 !max-h-none" : ""}`}
          onPaste={handlePaste}
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
                {DATA_COLS.map((col, colIdx) => (
                  <th
                    key={col.key}
                    className="col-head-selectable"
                    onMouseDown={(e) => beginColSelect(colIdx, e)}
                    onMouseEnter={() => extendColSelect(colIdx)}
                    title="Click (or drag) to select whole column(s). Shift/Ctrl to extend."
                  >
                    {col.label}
                  </th>
                ))}
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {list.map((c, rowIndex) => (
                <tr
                  key={c.id}
                  className={`${rowColorClass(c)} ${
                    bulkSelected.has(String(c.id)) ? "outline outline-1 outline-primary/40" : ""
                  }`}
                  data-id={c.id}
                >
                  <td
                    className="row-head row-head-selectable"
                    onMouseDown={(e) => beginRowSelect(rowIndex, e)}
                    onMouseEnter={() => extendRowSelect(rowIndex)}
                    title="Click (or drag) to select whole row(s). Shift/Ctrl to extend."
                  >
                    {rowIndex + 1}
                  </td>
                  <td className="freeze-check">
                    <input
                      type="checkbox"
                      checked={bulkSelected.has(String(c.id))}
                      onChange={(e) =>
                        toggleSelect(String(c.id), e.target.checked)
                      }
                    />
                  </td>
                  {/* Month */}
                  <td
                    className={isCellSelected(rowIndex, 0) ? "cell-selected" : ""}
                    onMouseDown={(e) => beginCellSelect(rowIndex, 0, e)}
                    onMouseEnter={() => extendCellSelect(rowIndex, 0)}
                  >
                    <span className="sheet-cell">{c.poMonth || ""}</span>
                  </td>
                  {/* Total */}
                  <td
                    className={`calc-cell ${isCellSelected(rowIndex, 1) ? "cell-selected" : ""}`}
                    onMouseDown={(e) => beginCellSelect(rowIndex, 1, e)}
                    onMouseEnter={() => extendCellSelect(rowIndex, 1)}
                  >
                    <span className="font-bold text-primary">
                      {money(c.totalServiceFee)}
                    </span>
                  </td>
                  {/* Terms = Assigned To */}
                  <td
                    className={isCellSelected(rowIndex, 2) ? "cell-selected" : ""}
                    onMouseDown={(e) => beginCellSelect(rowIndex, 2, e)}
                    onMouseEnter={() => extendCellSelect(rowIndex, 2)}
                  >
                    <span className="sheet-cell">{c.assignedTo || ""}</span>
                  </td>
                  {/* P.O. */}
                  <td
                    className={isCellSelected(rowIndex, 3) ? "cell-selected" : ""}
                    onMouseDown={(e) => beginCellSelect(rowIndex, 3, e)}
                    onMouseEnter={() => extendCellSelect(rowIndex, 3)}
                  >
                    <span className="sheet-cell">{c.po || ""}</span>
                  </td>
                  {/* Start Date */}
                  <td
                    className={isCellSelected(rowIndex, 4) ? "cell-selected" : ""}
                    onMouseDown={(e) => beginCellSelect(rowIndex, 4, e)}
                    onMouseEnter={() => extendCellSelect(rowIndex, 4)}
                  >
                    <span className="sheet-cell">{c.startDate || ""}</span>
                  </td>
                  {/* Candidate Name */}
                  <td
                    className={`important-col ${isCellSelected(rowIndex, 5) ? "cell-selected" : ""}`}
                    onMouseDown={(e) => beginCellSelect(rowIndex, 5, e)}
                    onMouseEnter={() => extendCellSelect(rowIndex, 5)}
                  >
                    <span className="sheet-cell name-priority">{c.name || ""}</span>
                  </td>
                  {Array.from({ length: 9 }, (_, idx) => {
                    const st = instStatus(c.installments[idx]);
                    const colIdx = 6 + idx;
                    return (
                      <td
                        key={idx}
                        className={`inst-col ${isCellSelected(rowIndex, colIdx) ? "cell-selected" : ""}`}
                        onMouseDown={(e) => beginCellSelect(rowIndex, colIdx, e)}
                        onMouseEnter={() => extendCellSelect(rowIndex, colIdx)}
                      >
                        <div className="inst-cell">
                          <div className="inst-row">
                            <span
                              className="sheet-cell inst-text"
                              onClick={() => editCandidate(c.id)}
                              title="Edit installments from the Edit option"
                            >
                              {instText(c, idx) || "-"}
                            </span>
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
  const { getRemaining: getRemainingAmt, nextUnpaid: nextUnpaidInst } =
    require("@/lib/crm") as typeof import("@/lib/crm");

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
              let lastPaymentDate = "";
              const installments = c.installments.map((i, idx) => {
                if (i.amount && !i.paid) {
                  const paymentDate = i.paymentDate || i.date || todayIso();
                  lastPaymentDate = paymentDate;
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
                  return { ...i, paid: true, paymentDate };
                }
                return i;
              });
              let normalized = normalizeCandidate({ ...c, installments });
              if (lastPaymentDate && getRemainingAmt(normalized) > 0) {
                const n = nextUnpaidInst(normalized);
                if (n)
                  normalized = {
                    ...normalized,
                    nextFollowUpDate: addDays(lastPaymentDate, 20),
                  };
              }
              return normalized;
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
