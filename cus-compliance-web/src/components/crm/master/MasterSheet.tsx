"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useCrm } from "../CrmProvider";
import { EmptyDataNotice, InlineLoading, LoadingBar } from "../DataStates";
import { FiltersBar, FilterGroup, FILTER_ICONS } from "../FiltersBar";
import {
  ColumnResizeHandle,
  PhoneInput,
  FullscreenExitFab,
  isModalOpen,
  ResetColumnsButton,
  useColumnOrder,
  useColumnWidths,
} from "../shared";
import {
  getRemaining,
  getTotalPaid,
  getNextDueDate,
  fmtDate,
  money,
  exportCandidatesCsv,
  importSheetRows,
  downloadBlob,
  phoneOf,
  todayIso,
  normalizeCandidate,
  parsePasteInstallment,
  newId,
} from "@/lib/crm";
import { DEFAULT_STATUSES, SALARY_TYPES, type Candidate } from "@/lib/crm/types";
import { StatementModal } from "../modals/StatementModal";
import { hiddenDataCols } from "../ColumnVisibility";
import {
  clearFocusRequest,
  FOCUS_MAX_AGE_MS,
  getFocusRequest,
  getServerFocusRequest,
  subscribeFocusRequest,
} from "@/lib/search-focus";

// True when focus is in a field the user can type into (text input,
// textarea, select, contenteditable) - checkboxes and buttons don't count.
function isEditingText(): boolean {
  const el = document.activeElement as HTMLElement | null;
  if (!el) return false;
  if (el.isContentEditable) return true;
  if (el.tagName === "TEXTAREA" || el.tagName === "SELECT") return true;
  if (el.tagName !== "INPUT") return false;
  // Installment cells are inputs too (clicking one focuses it), but a paste
  // there must go through the amount/date-aware sheet paste - the browser's
  // native paste would splice raw text into the existing "1500 Jan 14, 2026".
  if (el.classList.contains("inst-text")) return false;
  const type = (el as HTMLInputElement).type;
  return !["checkbox", "radio", "button", "submit", "reset"].includes(type);
}

function instText(c: Candidate, idx: number): string {
  const i = c.installments[idx];
  // A date with no amount is still a value the user entered - show it
  // instead of rendering the cell blank.
  return [i?.amount ? String(i.amount) : "", i?.date ? fmtDate(i.date) : ""]
    .filter(Boolean)
    .join(" ");
}

// Two-column card grid used on phones instead of the wide sheet. Tapping a
// card opens the existing candidate modal (detailed + editable view).
function MobileCandidateCards({
  list,
  onOpen,
  flashId,
  loading,
}: {
  list: Candidate[];
  onOpen: (id: number) => void;
  flashId?: number | null;
  loading?: boolean;
}) {
  if (!list.length && loading) return <InlineLoading label="Loading candidates…" />;
  if (!list.length) {
    return (
      <EmptyDataNotice message="No candidates found." />
    );
  }
  return (
    <div className="grid grid-cols-2 gap-2.5 p-2.5 pb-16">
      {list.map((c) => {
        const remaining = getRemaining(c);
        const next = getNextDueDate(c);
        return (
          <button
            key={c.id}
            type="button"
            data-cand-id={c.id}
            onClick={() => onOpen(c.id)}
            className={`flex min-w-0 flex-col gap-1.5 rounded-xl border border-border bg-card p-3 text-left shadow-sm active:bg-secondary ${flashId === c.id ? "search-hit" : ""}`}
          >
            <div className="flex items-start justify-between gap-1">
              <span className="min-w-0 break-words text-sm font-semibold leading-tight text-card-foreground">
                {c.name || "Unnamed"}
              </span>
            </div>
            {c.status && (
              <span className="w-fit max-w-full truncate rounded-full bg-secondary px-2 py-0.5 text-[length:calc(10px*var(--ui-text-scale,1))] font-semibold text-muted">
                {c.status}
              </span>
            )}
            <div className="truncate text-xs text-muted">
              {[c.assignedTo, c.poMonth].filter(Boolean).join(" · ") || "-"}
            </div>
            <div className="mt-auto grid grid-cols-2 gap-x-2 border-t border-border pt-1.5 text-[length:calc(11px*var(--ui-text-scale,1))]">
              <span className="text-muted">Paid</span>
              <span className="text-right font-semibold text-success">
                {money(getTotalPaid(c))}
              </span>
              <span className="text-muted">Left</span>
              <span
                className={`text-right font-semibold ${remaining > 0 ? "text-danger" : "text-success"}`}
              >
                {money(remaining)}
              </span>
              <span className="text-muted">Due</span>
              <span className="text-right">{next ? fmtDate(next) : "-"}</span>
            </div>
          </button>
        );
      })}
    </div>
  );
}

function instStatus(i: Candidate["installments"][0]) {
  if (!i?.amount) return { label: "", color: "text-muted" };
  if (i.paid) return { label: "PAID", color: "text-success" };
  if (i.date && new Date(i.date + "T00:00:00") < new Date())
    return { label: "OVERDUE", color: "text-danger" };
  return { label: "DUE", color: "text-muted" };
}

// Visible sheet columns, in the exact order requested:
// Month | Total | Terms (=Assigned To) | P.O. | Start Date | Candidate Name | Floor | 1st..9th date
// Every other candidate field (phone, status, remarks, fee %, contact
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
  { key: "name", label: "Candidate Name", editable: true, getText: (c) => c.name || "" },
  {
    key: "annualPackage",
    label: "Offer Amount",
    editable: true,
    getText: (c) => (c.annualPackage ? String(c.annualPackage) : ""),
  },
  {
    key: "serviceFeePercent",
    label: "Percentage",
    editable: true,
    getText: (c) => (c.serviceFeePercent ? String(c.serviceFeePercent) : ""),
  },
  {
    key: "totalServiceFee",
    label: "Total",
    editable: true,
    getText: (c) => (c.totalServiceFee ? String(c.totalServiceFee) : ""),
  },
  {
    key: "paid",
    label: "Paid",
    editable: false,
    getText: (c) => money(getTotalPaid(c)),
  },
  {
    key: "remaining",
    label: "Remaining",
    editable: false,
    getText: (c) => money(getRemaining(c)),
  },
  {
    key: "monthlyInstallment",
    label: "Monthly Installment",
    editable: true,
    getText: (c) => (c.monthlyInstallment ? String(c.monthlyInstallment) : ""),
  },
  { key: "startDate", label: "Start Date", editable: true, getText: (c) => c.startDate || "" },
  { key: "salaryType", label: "Salary Type", editable: true, getText: (c) => c.salaryType || "" },
  { key: "floor", label: "Floor", editable: true, getText: (c) => c.floor || "" },
  {
    key: "phoneNumber",
    label: "Phone Number",
    editable: true,
    getText: (c) => c.phoneNumber || "",
  },
  { key: "assignedTo", label: "Terms", editable: true, getText: (c) => c.assignedTo || "" },
  { key: "po", label: "P.O.", editable: true, getText: (c) => c.po || "" },
  { key: "status", label: "Status", editable: true, getText: (c) => c.status || "" },
  ...Array.from({ length: 9 }, (_, i) => ({
    key: "inst" + i,
    label:
      i + 1 + (i === 0 ? "st" : i === 1 ? "nd" : i === 2 ? "rd" : "th") + " date",
    editable: true,
    getText: (c: Candidate) => {
      const inst = c.installments[i];
      return [inst?.amount ? String(inst.amount) : "", inst?.date || ""]
        .filter(Boolean)
        .join(" ");
    },
  })),
];

const DATA_COL_KEYS = DATA_COLS.map((c) => c.key);
const DATA_COLS_BY_KEY = new Map(DATA_COLS.map((c) => [c.key, c]));

// Starting column widths before any manual resize - wider for columns whose
// cell content (inst-cell/name-priority, see .excel-grid CSS) needs the
// extra room, narrower for short numeric/date fields.
const DATA_COL_DEFAULT_WIDTHS: Record<string, number> = {
  name: 220,
  poMonth: 110,
  floor: 90,
  phoneNumber: 130,
  salaryType: 120,
  assignedTo: 110,
  status: 120,
  paid: 110,
  remaining: 110,
  monthlyInstallment: 150,
  ...Object.fromEntries(DATA_COLS.filter((c) => c.key.startsWith("inst")).map((c) => [c.key, 220])),
};

type CellPos = { row: number; col: number };
type Rect = { r0: number; r1: number; c0: number; c1: number };

export function MasterSheet() {
  const {
    filtered,
    candidates,
    togglePaid,
    updateMasterField,
    updateInstallment,
    deleteCandidate,
    editCandidate,
    duplicateLast,
    addBlankRow,
    deleteAllCandidates,
    toast,
    setCandidates,
    queueSave,
    cellSync,
    snapshot,
    bulkSelected,
    setBulkSelected,
    smartFilter,
    scopedTo,
    searchQuery,
    activeFilters,
    syncStatus,
    setSmartFilter,
    assignableUsers,
    getRemaining: _gr,
  } = useCrm() as ReturnType<typeof useCrm> & {
    getRemaining?: typeof getRemaining;
  };

  const scrollRef = useRef<HTMLDivElement>(null);
  const [followupFilter, setFollowupFilter] = useState("");
  const [methodFilter, setMethodFilter] = useState("");
  // Starts true so this table-heavy page opens straight into fullscreen -
  // users asked to land on the full table rather than have to click the
  // Fullscreen button every time (see useFullscreen in shared.tsx, which
  // this page predates and so duplicates rather than uses directly).
  // On phones (<768px, the card layout) it starts normal so the search,
  // filters and navigation stay reachable; the sheet only mounts after the
  // data has loaded on the client, so reading matchMedia here is safe.
  const [fullscreen, setFullscreen] = useState(
    () =>
      typeof window === "undefined" ||
      !window.matchMedia("(max-width: 767px)").matches
  );
  const fileRef = useRef<HTMLInputElement>(null);
  const [statementId, setStatementId] = useState<number | null>(null);
  const statementCandidate =
    statementId == null ? null : candidates.find((x) => x.id === statementId) ?? null;
  const [pasteProgress, setPasteProgress] = useState<{ done: number; total: number } | null>(
    null
  );
  const [draggingId, setDraggingId] = useState<number | null>(null);
  const [dragOverInfo, setDragOverInfo] = useState<
    { id: number; pos: "before" | "after" } | null
  >(null);

  // Column drag-to-reorder - order is a browser-local preference (see
  // useColumnOrder), so all cell/paste/select logic below reads column
  // definitions through `orderedCols` instead of DATA_COLS directly.
  const {
    order: colOrder,
    gripProps,
    headerProps,
    resetOrder: resetColOrder,
  } = useColumnOrder("masterSheetColumnOrder", DATA_COL_KEYS);
  const {
    colStyle,
    resizeHandleProps,
    resetWidths: resetColWidths,
  } = useColumnWidths(
    "masterSheetColumnWidths",
    DATA_COL_KEYS,
    DATA_COL_DEFAULT_WIDTHS
  );
  const orderedCols = useMemo(
    () => colOrder.map((k) => DATA_COLS_BY_KEY.get(k)!),
    [colOrder]
  );

  const addRow = (position: "top" | "bottom") => {
    addBlankRow(position);
    // Scroll so the new blank row is visible and ready to paste into -
    // it lands at index 0 (top) or the very end (bottom) of the sheet.
    requestAnimationFrame(() => {
      const el = scrollRef.current;
      if (!el) return;
      el.scrollTop = position === "top" ? 0 : el.scrollHeight;
    });
  };

  useEffect(() => {
    if (!fullscreen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !isModalOpen()) setFullscreen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [fullscreen]);

  const [srvError, setSrvError] = useState(false);
  let fullList = smartFilter || srvError ? filtered() : [];

  if (smartFilter) {
    const t = todayIso();
    if (smartFilter.type === "overdue") {
      fullList = fullList.filter((c) => {
        const n = getNextDueDate(c);
        return n && n < t && getRemaining(c) > 0;
      });
    } else if (smartFilter.type === "missingPhone") {
      fullList = fullList.filter((c) => !phoneOf(c) && c.status === "Active");
    } else if (smartFilter.type === "highBalance") {
      const amt = smartFilter.amount || 5000;
      fullList = fullList.filter((c) => getRemaining(c) >= amt);
    } else if (smartFilter.type === "focus") {
      fullList = fullList
        .filter((c) => getRemaining(c) > 0 && c.status === "Active")
        .sort((a, b) => {
          const da = getNextDueDate(a) || "9999";
          const db = getNextDueDate(b) || "9999";
          return da.localeCompare(db);
        });
    } else if (smartFilter.type === "duplicates") {
      const names = new Map<string, number>();
      fullList.forEach((c) => {
        const k = c.name.toLowerCase().trim();
        names.set(k, (names.get(k) || 0) + 1);
      });
      fullList = fullList.filter((c) => (names.get(c.name.toLowerCase().trim()) || 0) > 1);
    } else if (smartFilter.type === "missingData") {
      fullList = fullList.filter(
        (c) => !phoneOf(c) || !getNextDueDate(c) || !c.totalServiceFee
      );
    }
  }

  if (followupFilter) {
    const t = todayIso();
    if (followupFilter === "overdue")
      fullList = fullList.filter((c) => c.nextFollowUpDate && c.nextFollowUpDate < t);
    if (followupFilter === "today")
      fullList = fullList.filter((c) => c.nextFollowUpDate === t);
    if (followupFilter === "future")
      fullList = fullList.filter((c) => c.nextFollowUpDate && c.nextFollowUpDate > t);
    if (followupFilter === "never")
      fullList = fullList.filter((c) => !c.nextFollowUpDate);
  }
  if (methodFilter)
    fullList = fullList.filter((c) => c.contactMethod === methodFilter);

  // --- Pagination (server-side) ---------------------------------------------
  // The API (/api/candidates/page) runs search + filters over ALL candidates
  // in MongoDB and returns only the rows of the requested page. Smart filters
  // (computed values like overdue / balance) and a failed fetch fall back to
  // the in-memory path below. pageSize 0 = all.
  const [pageSize, setPageSize] = useState<number>(() => {
    try {
      if (typeof window === "undefined") return 50;
      const v = localStorage.getItem("masterSheetPageSize");
      return v != null && [0, 50, 100, 500].includes(Number(v)) ? Number(v) : 50;
    } catch {
      return 50;
    }
  });
  const [page, setPage] = useState(0);
  const [srv, setSrv] = useState<{
    key: string;
    rows: Candidate[];
    total: number;
    totalPages: number;
    totals: { committed: number; paid: number; remaining: number };
  } | null>(null);
  const clientMode = !!smartFilter || srvError;
  const savedTick = syncStatus.lastSavedAt;
  // Loading indicator only (no effect on what is fetched): true while a page
  // for a changed search / filter / page number is on its way.
  const [fetching, setFetching] = useState(false);
  const shownQueryRef = useRef("");

  // Any change to search/filters sends you back to page 1.
  const filterKey = JSON.stringify([searchQuery, activeFilters, followupFilter, methodFilter, smartFilter?.type ?? ""]);
  const [prevFilterKey, setPrevFilterKey] = useState(filterKey);
  if (prevFilterKey !== filterKey) {
    setPrevFilterKey(filterKey);
    setPage(0);
  }

  useEffect(() => {
    if (clientMode) return;
    const ac = new AbortController();
    const queryKey = JSON.stringify([page, pageSize, searchQuery, activeFilters, followupFilter, methodFilter]);
    if (queryKey !== shownQueryRef.current) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setFetching(true);
    }
    const t = setTimeout(
      async () => {
        try {
          const p = new URLSearchParams({
            page: String(page),
            size: String(pageSize),
            today: todayIso(),
          });
          if (searchQuery.trim()) p.set("q", searchQuery.trim());
          for (const [k, v] of Object.entries(activeFilters)) if (v) p.set(k, String(v));
          if (followupFilter) p.set("followup", followupFilter);
          if (methodFilter) p.set("method", methodFilter);
          const res = await fetch(`/api/candidates/page?${p}`, {
            cache: "no-store",
            signal: ac.signal,
          });
          if (!res.ok) throw new Error("page fetch failed");
          const data = await res.json();
          setSrv({
            key: p.toString(),
            rows: (data.candidates || []).map((x: Candidate) => normalizeCandidate(x)),
            total: data.total,
            totalPages: data.totalPages,
            totals: data.totals,
          });
          if (data.page !== page) setPage(data.page);
          shownQueryRef.current = queryKey;
          setFetching(false);
        } catch (e) {
          if ((e as Error)?.name !== "AbortError") {
            setSrvError(true);
            setFetching(false);
          }
        }
      },
      searchQuery ? 250 : 0
    );
    return () => {
      clearTimeout(t);
      ac.abort();
    };
  }, [clientMode, page, pageSize, searchQuery, activeFilters, followupFilter, methodFilter, savedTick]);

  const byId = useMemo(() => new Map(candidates.map((c) => [c.id, c])), [candidates]);
  const matchCount = clientMode ? fullList.length : (srv?.total ?? 0);
  const totalPages = clientMode
    ? pageSize === 0 ? 1 : Math.max(1, Math.ceil(fullList.length / pageSize))
    : Math.max(1, srv?.totalPages ?? 1);
  const curPage = Math.min(page, totalPages - 1);
  const pageStart = pageSize === 0 ? 0 : curPage * pageSize;
  // Rows come from the server, but are shown as the live in-memory copy so
  // edits/deletes made locally appear instantly (and unsaved edits survive).
  const list: Candidate[] = clientMode
    ? pageSize === 0
      ? fullList
      : fullList.slice(pageStart, pageStart + pageSize)
    : (srv?.rows ?? []).flatMap((r) =>
        candidates.length ? (byId.get(r.id) ?? []) : [r]
      );
  const loadingPage = !clientMode && srv == null;
  const refetching = !clientMode && fetching && srv != null;
  const kpi = clientMode
    ? {
        committed: fullList.reduce((s, c) => s + (Number(c.totalServiceFee) || 0), 0),
        paid: fullList.reduce((s, c) => s + getTotalPaid(c), 0),
        remaining: fullList.reduce((s, c) => s + getRemaining(c), 0),
      }
    : (srv?.totals ?? { committed: 0, paid: 0, remaining: 0 });
  // --- Jump to a candidate picked in the header search ---------------------
  // Clears the sheet's own filters, asks the server which page the candidate
  // is on, then scrolls to the row and highlights it for a few seconds.
  const focusReq = useSyncExternalStore(
    subscribeFocusRequest,
    getFocusRequest,
    getServerFocusRequest
  );
  const [hit, setHit] = useState<{ id: number; key: string } | null>(null);
  const [flashId, setFlashId] = useState<number | null>(null);

  useEffect(() => {
    if (!focusReq) return;
    const { id, nonce, at } = focusReq;
    clearFocusRequest(nonce);
    if (Date.now() - at > FOCUS_MAX_AGE_MS) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setFollowupFilter("");
    setMethodFilter("");
    if (srvError) {
      setHit({ id, key: "" });
      return;
    }
    void (async () => {
      try {
        const res = await fetch(
          `/api/candidates/locate?id=${id}&size=${pageSize}`,
          { cache: "no-store" }
        );
        if (!res.ok) throw new Error("locate failed");
        const data = (await res.json()) as { page: number };
        setPage(data.page);
        setHit({
          id,
          key: new URLSearchParams({
            page: String(data.page),
            size: String(pageSize),
            today: todayIso(),
          }).toString(),
        });
      } catch {
        toast("Couldn't find that candidate on the sheet yet - try again once it is saved", "info");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusReq]);

  useEffect(() => {
    if (!hit) return;
    const t = setTimeout(() => setHit(null), 8000);
    return () => clearTimeout(t);
  }, [hit]);

  useEffect(() => {
    if (!hit) return;
    const inList = list.some((c) => c.id === hit.id);
    // In server mode wait until the rows for the located page have arrived
    // (not the previous, filtered page that is still on screen).
    if (inList && (clientMode || srv?.key === hit.key)) {
      const root = document;
      const els = [
        root.querySelector<HTMLElement>(`tr[data-id="${hit.id}"]`),
        root.querySelector<HTMLElement>(`[data-cand-id="${hit.id}"]`),
      ];
      const el = els.find((x) => x && x.offsetParent !== null) ?? null;
      el?.scrollIntoView({ block: "center", behavior: "smooth" });
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setFlashId(hit.id);
      setHit(null);
      return;
    }
    if (clientMode && pageSize > 0) {
      const idx = fullList.findIndex((c) => c.id === hit.id);
      if (idx >= 0) {
        const np = Math.floor(idx / pageSize);
        if (np !== curPage) setPage(np);
      }
    }
  }, [hit, list, srv, clientMode, fullList, pageSize, curPage]);

  useEffect(() => {
    if (flashId == null) return;
    const t = setTimeout(() => setFlashId(null), 4500);
    return () => clearTimeout(t);
  }, [flashId]);

  const changePageSize = (n: number) => {
    setPageSize(n);
    setPage(0);
    try {
      localStorage.setItem("masterSheetPageSize", String(n));
    } catch {}
  };

  // --- Row drag-to-reorder -------------------------------------------------
  // `list` can be a filtered subset of `candidates`, so a drag only ever
  // reorders among the currently-visible rows; hidden (filtered-out) rows
  // keep their exact original slots in the underlying array. This keeps the
  // move accurate regardless of active filters/search.
  const reorderRows = useCallback(
    (draggedId: number, targetId: number, after: boolean) => {
      if (draggedId === targetId) return;
      const visibleIds = list.map((c) => c.id);
      const fromIdx = visibleIds.indexOf(draggedId);
      const targetIdx = visibleIds.indexOf(targetId);
      if (fromIdx < 0 || targetIdx < 0) return;

      const reordered = [...visibleIds];
      reordered.splice(fromIdx, 1);
      let insertAt = reordered.indexOf(targetId);
      if (after) insertAt += 1;
      reordered.splice(insertAt, 0, draggedId);

      const visibleIdSet = new Set(visibleIds);
      const candidateMap = new Map(candidates.map((c) => [c.id, c]));
      const next = [...candidates];
      let vi = 0;
      for (let i = 0; i < next.length; i++) {
        if (visibleIdSet.has(next[i].id)) {
          next[i] = candidateMap.get(reordered[vi]) ?? next[i];
          vi += 1;
        }
      }
      snapshot();
      setCandidates(next);
      queueSave();
    },
    [list, candidates, snapshot, setCandidates, queueSave]
  );

  const handleRowDragOver = (id: number) => (e: React.DragEvent<HTMLTableRowElement>) => {
    if (draggingId == null || draggingId === id) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    const rect = e.currentTarget.getBoundingClientRect();
    const pos: "before" | "after" = e.clientY - rect.top < rect.height / 2 ? "before" : "after";
    setDragOverInfo((prev) => (prev && prev.id === id && prev.pos === pos ? prev : { id, pos }));
  };

  const handleRowDrop = (id: number) => (e: React.DragEvent<HTMLTableRowElement>) => {
    e.preventDefault();
    const draggedId = draggingId;
    const pos = dragOverInfo?.pos ?? "before";
    setDraggingId(null);
    setDragOverInfo(null);
    if (draggedId == null || draggedId === id) return;
    reorderRows(draggedId, id, pos === "after");
  };

  const handleRowDragEnd = () => {
    setDraggingId(null);
    setDragOverInfo(null);
  };

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
      // hidden columns aren't copied
      const hiddenCols = hiddenDataCols(scrollRef.current);
      const cols = [...colSet].filter((c) => !hiddenCols.has(c)).sort((a, b) => a - b);
      const inSelection = (r: number, c: number) =>
        rects.some((rect) => r >= rect.r0 && r <= rect.r1 && c >= rect.c0 && c <= rect.c1);
      return rows
        .map((r) => {
          const cand = list[r];
          if (!cand) return "";
          return cols
            .map((c) => (inSelection(r, c) ? orderedCols[c].getText(cand) : ""))
            .join("\t");
        })
        .join("\n");
    },
    [list, orderedCols]
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

  // Extracted so both existing rows and newly-created rows (see below) go
  // through identical column parsing.
  const applyRowFields = useCallback(
    (c: Candidate, rowText: string, anchorCol: number) => {
      const cols = rowText.split("\t");
      // Pasted values fill the visible columns left to right; hidden
      // columns are skipped so they're never written to.
      const hiddenCols = hiddenDataCols(scrollRef.current);
      let target = anchorCol;
      cols.forEach((val) => {
        while (hiddenCols.has(target)) target += 1;
        const colDef = orderedCols[target];
        target += 1;
        if (!colDef || !colDef.editable) return;
        const trimmed = val.trim();
        if (colDef.key.startsWith("inst")) {
          const instIdx = Number(colDef.key.slice(4));
          const old = c.installments[instIdx] || normalizeCandidate({}).installments[0];
          // Only the parts actually present in the pasted text (amount,
          // date, or both) are applied; the cell's other value is kept.
          const parsed = parsePasteInstallment(trimmed);
          // Pasted values land as PAID (never auto-overdue); the user
          // unticks the checkbox to mark one unpaid. Pasting an empty cell
          // clears the installment, so it is unpaid again.
          const paid = trimmed ? true : false;
          const merged = { ...old, ...parsed };
          c.installments[instIdx] = {
            ...merged,
            paid,
            paymentDate: paid
              ? old.paid && old.paymentDate
                ? old.paymentDate
                : merged.date || todayIso()
              : "",
            receipt: old.receipt || "",
            notes: old.notes || "",
          };
        } else if (colDef.key === "totalServiceFee") {
          // normalizeCandidate recomputes totalServiceFee from
          // annualPackage x serviceFeePercent whenever both are non-zero,
          // which would silently discard a pasted Total - clear the pair
          // so the pasted flat amount actually sticks.
          c.annualPackage = 0;
          c.serviceFeePercent = 0;
          (c as unknown as Record<string, unknown>)[colDef.key] =
            Number(trimmed.replace(/[$,%\s,]/g, "")) || 0;
        } else if (
          colDef.key === "annualPackage" ||
          colDef.key === "serviceFeePercent" ||
          colDef.key === "monthlyInstallment"
        ) {
          (c as unknown as Record<string, unknown>)[colDef.key] =
            Number(trimmed.replace(/[$,%\s,]/g, "")) || 0;
        } else {
          (c as unknown as Record<string, unknown>)[colDef.key] = trimmed;
        }
      });
    },
    [orderedCols]
  );

  // A row pasted past the last existing (visible) candidate has no id to
  // write onto - it used to just be dropped on the floor. Instead we create
  // a fresh candidate for it, same as "Duplicate Last" does, then run it
  // through the same column mapping as an existing row. Creation itself is
  // instant (client-side only, one snapshot save at the end) but for large
  // pastes we yield to the browser every few rows so a progress overlay can
  // actually paint instead of appearing to hang.
  const runPaste = useCallback(
    async (text: string, anchor: CellPos, ids: number[], startRow: number) => {
      const rows = text.replace(/\r/g, "").split("\n").filter(Boolean);
      const existingSlots = Math.max(0, ids.length - startRow);
      const totalNew = Math.max(0, rows.length - existingSlots);
      const showProgress = totalNew >= 5;
      if (showProgress) setPasteProgress({ done: 0, total: totalNew });

      let next = [...candidates];
      let created = 0;
      for (let ri = 0; ri < rows.length; ri++) {
        const id = ids[startRow + ri];
        let ci: number;
        if (id != null) {
          ci = next.findIndex((c) => c.id === id);
          if (ci < 0) continue;
        } else {
          next.push(normalizeCandidate({ id: newId(), assignedTo: scopedTo }));
          ci = next.length - 1;
          created += 1;
          if (showProgress) {
            setPasteProgress({ done: created, total: totalNew });
            if (created % 4 === 0) {
              await new Promise((resolve) => setTimeout(resolve, 0));
            }
          }
        }
        const c = { ...next[ci], installments: [...next[ci].installments] };
        applyRowFields(c, rows[ri], anchor.col);
        next[ci] = c as Candidate;
      }

      next = next.map((c) => {
        const orig = candidates.find((x) => x.id === c.id);
        return orig === c ? c : normalizeCandidate(c);
      });
      setCandidates(next);
      queueSave();
      setPasteProgress(null);
      toast(
        created > 0
          ? `Paste applied - ${created} new candidate${created > 1 ? "s" : ""} created`
          : "Paste applied",
        "success"
      );
    },
    [candidates, scopedTo, applyRowFields, setCandidates, queueSave, toast]
  );

  const lastPasteRef = useRef({ text: "", at: 0 });

  const applyPasteText = useCallback(
    (text: string, anchor: CellPos) => {
      // A single value is applied to the selected cell too - unless the user
      // is typing in a text field, where the browser's own paste must win.
      const isSingle = !text.includes("\t") && !text.includes("\n");
      if (isSingle && (!text.trim() || isEditingText())) return false;
      const startCandidate = list[anchor.row];
      if (!startCandidate) return false;
      const ids = list.map((c) => c.id);
      const startRow = ids.indexOf(startCandidate.id);
      if (startRow < 0) return false;
      // One Ctrl+V reaches us twice when focus is inside the grid (the
      // keydown clipboard read and the native paste event). Apply it once.
      const now = Date.now();
      const last = lastPasteRef.current;
      if (last.text === text && now - last.at < 500) return true;
      lastPasteRef.current = { text, at: now };
      snapshot();
      void runPaste(text, anchor, ids, startRow);
      return true;
    },
    [list, snapshot, runPaste]
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
      // A modal (e.g. Edit Candidate) owns the clipboard while it's open -
      // otherwise Ctrl+C/V would copy/paste the sheet selection behind it.
      if (isModalOpen()) return;
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

  // Backspace/Delete clears every editable cell in the current selection -
  // reuses applyRowFields (same per-column reset rules as paste) by feeding
  // it a row of empty values for exactly the selected column span.
  const clearSelection = useCallback(() => {
    if (!allRects.length) return;
    const ids = list.map((c) => c.id);
    const hiddenCols = hiddenDataCols(scrollRef.current);
    let next = [...candidates];
    const touched = new Set<number>();
    for (const rect of allRects) {
      for (let r = rect.r0; r <= rect.r1; r++) {
        const id = ids[r];
        if (id == null) continue;
        const ci = next.findIndex((c) => c.id === id);
        if (ci < 0) continue;
        const c = { ...next[ci], installments: [...next[ci].installments] };
        // Only the visible columns inside the selection are cleared.
        let width = 0;
        for (let k = rect.c0; k <= rect.c1; k++) if (!hiddenCols.has(k)) width += 1;
        applyRowFields(c, Array(width).fill("").join("\t"), rect.c0);
        next[ci] = c;
        touched.add(id);
      }
    }
    if (!touched.size) return;
    snapshot();
    next = next.map((c) => (touched.has(c.id) ? normalizeCandidate(c) : c));
    setCandidates(next);
    queueSave();
    toast("Selection cleared", "success");
  }, [allRects, list, candidates, applyRowFields, snapshot, setCandidates, queueSave, toast]);

  // Only intercepts Backspace/Delete when it's clearly meant for the sheet:
  // focus is either inside one of the grid's own cells (marked "sheet-cell"),
  // or nowhere text-editable at all (the common case right after selecting a
  // whole row/column via its header, which doesn't focus an input). Any
  // *other* focused input/textarea/select on the page - a filter, a modal -
  // keeps its normal Backspace/Delete behavior even if a stale selection is
  // still technically active underneath it.
  //
  // A single editable text cell that's actively focused (the normal case
  // while typing a correction into it) is a second exception: let the
  // browser delete one character at a time there instead of wiping the
  // whole value. A multi-cell range still bulk-clears on Backspace/Delete
  // regardless of what's focused, since that's the deliberate "select a
  // range, clear it" gesture this shortcut exists for.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Backspace" && e.key !== "Delete") return;
      if (!hasSelection || isModalOpen()) return;
      const active = document.activeElement as HTMLElement | null;
      const isGridTextInput =
        (active instanceof HTMLInputElement ||
          active instanceof HTMLTextAreaElement) &&
        active.classList.contains("sheet-cell");
      if (isGridTextInput) {
        const isSingleCell = allRects.every(
          (r) => r.r0 === r.r1 && r.c0 === r.c1
        );
        if (allRects.length <= 1 && isSingleCell) return;
      }
      const isForeignInput =
        active &&
        (active instanceof HTMLInputElement ||
          active instanceof HTMLTextAreaElement ||
          active instanceof HTMLSelectElement) &&
        !active.classList.contains("sheet-cell");
      if (isForeignInput) return;
      e.preventDefault();
      clearSelection();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [hasSelection, clearSelection, allRects]);

  // Arrow-key navigation between sheet cells - only kicks in when focus is
  // already inside one of the grid's own inputs/selects (marked with the
  // "sheet-cell" class), so it never touches toolbar controls, modals, etc.
  // Left/Right defer to the browser's normal cursor movement unless the
  // caret is already at the start/end of the field, so typed text is still
  // navigable with the same keys.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (
        e.key !== "ArrowUp" &&
        e.key !== "ArrowDown" &&
        e.key !== "ArrowLeft" &&
        e.key !== "ArrowRight"
      )
        return;
      const target = e.target as HTMLElement;
      if (!target.classList?.contains("sheet-cell")) return;
      const td = target.closest("td[data-row][data-col]") as HTMLElement | null;
      if (!td) return;
      const row = Number(td.dataset.row);
      const col = Number(td.dataset.col);
      if (Number.isNaN(row) || Number.isNaN(col)) return;

      if (
        target instanceof HTMLInputElement &&
        (e.key === "ArrowLeft" || e.key === "ArrowRight")
      ) {
        const atStart = target.selectionStart === 0 && target.selectionEnd === 0;
        const atEnd =
          target.selectionStart === target.value.length &&
          target.selectionEnd === target.value.length;
        if (e.key === "ArrowLeft" && !atStart) return;
        if (e.key === "ArrowRight" && !atEnd) return;
      }

      let newRow = row;
      let newCol = col;
      if (e.key === "ArrowUp") newRow -= 1;
      else if (e.key === "ArrowDown") newRow += 1;
      else if (e.key === "ArrowLeft") newCol -= 1;
      else newCol += 1;
      if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
        // step over hidden columns
        const hiddenCols = hiddenDataCols(scrollRef.current);
        const step = e.key === "ArrowLeft" ? -1 : 1;
        while (hiddenCols.has(newCol)) newCol += step;
      }

      if (newRow < 0 || newRow >= list.length) return;
      if (newCol < 0 || newCol >= DATA_COLS.length) return;

      const nextTd = scrollRef.current?.querySelector(
        `td[data-row="${newRow}"][data-col="${newCol}"]`
      ) as HTMLElement | null;
      const focusable = nextTd?.querySelector("input, select") as
        | HTMLInputElement
        | HTMLSelectElement
        | null;
      if (!focusable) return;

      e.preventDefault();
      focusable.focus();
      if (focusable instanceof HTMLInputElement) {
        const pos = focusable.value.length;
        focusable.setSelectionRange(pos, pos);
      }
      setRanges([]);
      setLiveAnchor({ row: newRow, col: newCol });
      setLiveFocus({ row: newRow, col: newCol });
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [list.length]);

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

  const renderDataCell = (
    col: DataCol,
    rowIndex: number,
    vi: number,
    c: Candidate
  ) => {
    const selectedCls = isCellSelected(rowIndex, vi) ? "cell-selected" : "";
    const cellProps = {
      "data-row": rowIndex,
      "data-col": vi,
      "data-sync": cellSync(c.id, col.key),
      "data-cid": c.id,
      "data-field": col.key,
      onMouseDown: (e: React.MouseEvent) => beginCellSelect(rowIndex, vi, e),
      onMouseEnter: () => extendCellSelect(rowIndex, vi),
    };

    if (col.key === "poMonth") {
      return (
        <td key={col.key} {...cellProps} className={selectedCls}>
          <input
            className="sheet-cell"
            defaultValue={c.poMonth || ""}
            key={c.id + "-poMonth-" + (c.poMonth || "")}
            onBlur={(e) =>
              e.target.value !== (c.poMonth || "") &&
              updateMasterField(c.id, "poMonth", e.target.value)
            }
          />
        </td>
      );
    }
    if (col.key === "annualPackage") {
      return (
        <td key={col.key} {...cellProps} className={selectedCls}>
          <input
            className="sheet-cell"
            defaultValue={c.annualPackage ? String(c.annualPackage) : ""}
            key={c.id + "-annualPackage-" + c.annualPackage}
            placeholder="0"
            title="Offer amount - combined with Percentage to compute Total"
            onBlur={(e) => {
              if (e.target.value === (c.annualPackage ? String(c.annualPackage) : "")) return;
              updateMasterField(c.id, "annualPackage", e.target.value);
            }}
          />
        </td>
      );
    }
    if (col.key === "monthlyInstallment") {
      return (
        <td key={col.key} {...cellProps} className={selectedCls}>
          <input
            className="sheet-cell"
            defaultValue={c.monthlyInstallment ? String(c.monthlyInstallment) : ""}
            key={c.id + "-monthlyInstallment-" + c.monthlyInstallment}
            placeholder="0"
            onBlur={(e) => {
              if (e.target.value === (c.monthlyInstallment ? String(c.monthlyInstallment) : "")) return;
              updateMasterField(c.id, "monthlyInstallment", e.target.value);
            }}
          />
        </td>
      );
    }
    if (col.key === "serviceFeePercent") {
      return (
        <td key={col.key} {...cellProps} className={selectedCls}>
          <input
            className="sheet-cell"
            defaultValue={c.serviceFeePercent ? String(c.serviceFeePercent) : ""}
            key={c.id + "-serviceFeePercent-" + c.serviceFeePercent}
            placeholder="0"
            title="Service fee % - combined with Offer Amount to compute Total"
            onBlur={(e) => {
              if (e.target.value === (c.serviceFeePercent ? String(c.serviceFeePercent) : "")) return;
              updateMasterField(c.id, "serviceFeePercent", e.target.value);
            }}
          />
        </td>
      );
    }
    if (col.key === "totalServiceFee") {
      return (
        <td key={col.key} {...cellProps} className={selectedCls}>
          <input
            className="sheet-cell font-bold text-primary"
            defaultValue={c.totalServiceFee ? String(c.totalServiceFee) : ""}
            key={c.id + "-total-" + c.totalServiceFee}
            placeholder="0"
            title={
              c.annualPackage && c.serviceFeePercent
                ? "Computed from Offer Amount × Percentage - edit those columns, or clear one to type Total directly"
                : undefined
            }
            onBlur={(e) => {
              if (e.target.value === (c.totalServiceFee ? String(c.totalServiceFee) : "")) return;
              updateMasterField(c.id, "totalServiceFee", e.target.value);
            }}
          />
        </td>
      );
    }
    if (col.key === "paid") {
      return (
        <td key={col.key} {...cellProps} className={selectedCls}>
          <div
            className="sheet-cell calc-cell success-text"
            title="Sum of paid installments - not editable, edit the installment columns instead"
          >
            {money(getTotalPaid(c))}
          </div>
        </td>
      );
    }
    if (col.key === "remaining") {
      return (
        <td key={col.key} {...cellProps} className={`remaining-col ${selectedCls}`}>
          <div
            className="sheet-cell calc-cell danger-text"
            title="Total minus Paid - not editable, edit the Total or installment columns instead"
          >
            {money(getRemaining(c))}
          </div>
        </td>
      );
    }
    if (col.key === "assignedTo") {
      return (
        <td key={col.key} {...cellProps} className={selectedCls}>
          <select
            className="sheet-cell"
            value={c.assignedTo || ""}
            onChange={(e) => updateMasterField(c.id, "assignedTo", e.target.value)}
          >
            <option value="">-</option>
            {[
              ...new Set(
                c.assignedTo ? [...assignableUsers, c.assignedTo] : assignableUsers
              ),
            ].map((name) => (
              <option key={name}>{name}</option>
            ))}
          </select>
        </td>
      );
    }
    if (col.key === "po") {
      return (
        <td key={col.key} {...cellProps} className={selectedCls}>
          <input
            className="sheet-cell"
            defaultValue={c.po || ""}
            key={c.id + "-po-" + (c.po || "")}
            onBlur={(e) =>
              e.target.value !== (c.po || "") &&
              updateMasterField(c.id, "po", e.target.value)
            }
          />
        </td>
      );
    }
    if (col.key === "status") {
      return (
        <td key={col.key} {...cellProps} className={selectedCls}>
          <select
            className="sheet-cell"
            value={c.status || ""}
            onChange={(e) => updateMasterField(c.id, "status", e.target.value)}
          >
            <option value="">Active</option>
            {DEFAULT_STATUSES.map((s) => (
              <option key={s}>{s}</option>
            ))}
            {/* A status outside the defaults (e.g. "No Response", set by the
                auto workflow) must still show as itself, not fall back to
                the first option ("Active"). */}
            {c.status && !(DEFAULT_STATUSES as readonly string[]).includes(c.status) && (
              <option key={c.status}>{c.status}</option>
            )}
          </select>
        </td>
      );
    }
    if (col.key === "salaryType") {
      return (
        <td key={col.key} {...cellProps} className={selectedCls}>
          <select
            className="sheet-cell"
            value={c.salaryType || ""}
            onChange={(e) => updateMasterField(c.id, "salaryType", e.target.value)}
          >
            <option value="">-</option>
            {SALARY_TYPES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </td>
      );
    }
    if (col.key === "startDate") {
      return (
        <td key={col.key} {...cellProps} className={selectedCls}>
          <input
            className="sheet-cell"
            defaultValue={c.startDate || ""}
            key={c.id + "-startDate-" + (c.startDate || "")}
            placeholder="YYYY-MM-DD"
            onBlur={(e) =>
              e.target.value !== (c.startDate || "") &&
              updateMasterField(c.id, "startDate", e.target.value)
            }
          />
        </td>
      );
    }
    if (col.key === "name") {
      return (
        <td key={col.key} {...cellProps} className={`important-col ${selectedCls}`}>
          <input
            className="sheet-cell name-priority"
            defaultValue={c.name || ""}
            key={c.id + "-name-" + (c.name || "")}
            onBlur={(e) =>
              e.target.value !== (c.name || "") &&
              updateMasterField(c.id, "name", e.target.value)
            }
          />
        </td>
      );
    }
    if (col.key === "floor") {
      return (
        <td key={col.key} {...cellProps} className={selectedCls}>
          <input
            className="sheet-cell"
            defaultValue={c.floor || ""}
            key={c.id + "-floor-" + (c.floor || "")}
            onBlur={(e) =>
              e.target.value !== (c.floor || "") &&
              updateMasterField(c.id, "floor", e.target.value)
            }
          />
        </td>
      );
    }
    if (col.key === "phoneNumber") {
      return (
        <td key={col.key} {...cellProps} className={selectedCls}>
          <PhoneInput
            value={c.phoneNumber || ""}
            onCommit={(v) => updateMasterField(c.id, "phoneNumber", v)}
          />
        </td>
      );
    }
    // Installment columns are keyed "inst0".."inst8"
    const idx = Number(col.key.slice(4));
    const st = instStatus(c.installments[idx]);
    return (
      <td key={col.key} {...cellProps} className={`inst-col ${selectedCls}`}>
        <div className="inst-cell">
          <div className="inst-row">
            <input
              className={`sheet-cell inst-text ${
                st.label === "PAID"
                  ? "inst-paid"
                  : st.label === "OVERDUE"
                    ? "inst-overdue"
                    : ""
              }`}
              title={st.label || undefined}
              type="text"
              defaultValue={instText(c, idx)}
              key={c.id + "-" + idx + "-" + instText(c, idx)}
              placeholder=""
              onBlur={(e) =>
                e.target.value !== instText(c, idx) &&
                updateInstallment(c.id, idx, e.target.value)
              }
            />
            <input
              type="checkbox"
              checked={!!c.installments[idx]?.paid}
              onChange={(e) => togglePaid(c.id, idx, e.target.checked)}
            />
          </div>
        </div>
      </td>
    );
  };

  const shellCls = fullscreen
    ? "fixed inset-0 z-[3000] flex flex-col bg-background px-0 py-4"
    : "";

  return (
    <div className={shellCls}>
      {!fullscreen && (
        <>
          {smartFilter && (
            <div className="mb-3 flex items-center justify-between rounded-(--radius) border border-primary/30 bg-primary/5 px-4 py-2 text-sm">
              <span>
                ✨ Smart filter active · {matchCount} matching candidates
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
        className={`master-theme-card relative overflow-hidden rounded-(--radius) border border-border bg-card ${fullscreen ? "flex min-h-0 flex-1 flex-col" : ""
          }`}
      >
        <LoadingBar active={loadingPage || refetching} label="Loading candidates" />
        {!fullscreen && (
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-5 py-4">
            <div className="master-title-block w-full">
              <div className="master-title">Master P.O Sheet</div>
              <div className="master-kpis">
                <div className="master-kpi">
                  <div className="master-kpi-label">Total Candidates</div>
                  <div className="master-kpi-value">{matchCount}</div>
                </div>
                <div className="master-kpi">
                  <div className="master-kpi-label">Total Committed</div>
                  <div className="master-kpi-value">
                    {money(kpi.committed)}
                  </div>
                </div>
                <div className="master-kpi">
                  <div className="master-kpi-label">Total Realized</div>
                  <div className="master-kpi-value">
                    {money(kpi.paid)}
                  </div>
                </div>
                <div className="master-kpi">
                  <div className="master-kpi-label">Outstanding</div>
                  <div className="master-kpi-value">
                    {money(kpi.remaining)}
                  </div>
                </div>
              </div>
            </div>
            <div className="master-toolbar w-full">
              <FiltersBar iconOnly embedded>
                <span className="mx-1 hidden h-6 w-px bg-border sm:block" />
                <FilterGroup text="Follow-up" icon={FILTER_ICONS.followUp} iconOnly>
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
                </FilterGroup>
                <FilterGroup text="Contact Method" icon={FILTER_ICONS.contactMethod} iconOnly>
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
                </FilterGroup>
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
            <div className="flex flex-wrap items-center gap-2">
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
                title="Add a blank row to the top - pastes anchored there will overwrite it and auto-create as many more rows as needed"
                className="rounded border border-border bg-secondary px-3 py-1.5 text-xs"
                onClick={() => addRow("top")}
              >
                ➕ Add Row (Top)
              </button>
              <button
                type="button"
                title="Add a blank row to the bottom - pastes anchored there will overwrite it and auto-create as many more rows as needed"
                className="rounded border border-border bg-secondary px-3 py-1.5 text-xs"
                onClick={() => addRow("bottom")}
              >
                ➕ Add Row (Bottom)
              </button>
              <ResetColumnsButton
                onReset={() => {
                  resetColOrder();
                  resetColWidths();
                }}
              />
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
          </div>
        )}
        {matchCount > 0 && (
          <PageBar
            position="top"
            pageStart={pageStart}
            shown={list.length}
            matchCount={matchCount}
            pageSize={pageSize}
            changePageSize={changePageSize}
            curPage={curPage}
            totalPages={totalPages}
            setPage={setPage}
          />
        )}
        {/* Phone-only card layout (<768px). Hidden from md up, where the
            full sheet below is shown instead. */}
        <div
          className={`md:hidden ${fullscreen ? "min-h-0 flex-1 overflow-auto" : ""}`}
        >
          <MobileCandidateCards list={list} onOpen={editCandidate} flashId={flashId} loading={loadingPage} />
        </div>
        <div
          ref={scrollRef}
          id="masterScroll"
          className={`table-scroll hidden overflow-auto md:block ${fullscreen ? "flex-1 max-h-none!" : ""} ${refetching ? "ld-dim" : ""}`}
          onPaste={handlePaste}
        >
          <table className="excel-grid master-theme">
            <thead>
              <tr>
                <th className="row-head" title="Drag a row's handle to reorder it">⠿</th>
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
                {orderedCols.map((col, colIdx) => {
                  const hp = headerProps(col.key);
                  return (
                    <th
                      key={col.key}
                      className={`col-head-selectable ${hp.className}`}
                      style={colStyle(col.key)}
                      onMouseDown={(e) => beginColSelect(colIdx, e)}
                      onMouseEnter={() => extendColSelect(colIdx)}
                      onDragOver={hp.onDragOver}
                      onDrop={hp.onDrop}
                      title="Click (or drag) to select whole column(s). Shift/Ctrl to extend. Drag the ⠿ handle to reorder columns."
                    >
                      <span
                        className="mr-1 inline-block cursor-grab select-none active:cursor-grabbing"
                        title="Drag to reorder this column"
                        {...gripProps(col.key)}
                      >
                        ⠿
                      </span>
                      {col.label}
                      <ColumnResizeHandle {...resizeHandleProps(col.key)} />
                    </th>
                  );
                })}
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {list.map((c, rowIndex) => (
                <tr
                  key={c.id}
                  className={`${c.status === "Cancelled" ? "row-cancelled" : ""
                    } ${flashId === c.id ? "search-hit" : ""
                    } ${bulkSelected.has(String(c.id)) ? "outline outline-primary/40" : ""
                    } ${draggingId === c.id ? "opacity-40" : ""} ${dragOverInfo?.id === c.id && dragOverInfo.pos === "before"
                      ? "border-t-2 border-t-primary"
                      : dragOverInfo?.id === c.id && dragOverInfo.pos === "after"
                        ? "border-b-2 border-b-primary"
                        : ""
                    }`}
                  data-id={c.id}
                  onDragOver={draggingId != null ? handleRowDragOver(c.id) : undefined}
                  onDrop={draggingId != null ? handleRowDrop(c.id) : undefined}
                >
                  <td
                    className="row-head cursor-grab select-none text-center active:cursor-grabbing"
                    draggable
                    onDragStart={(e) => {
                      setDraggingId(c.id);
                      e.dataTransfer.effectAllowed = "move";
                      e.dataTransfer.setData("text/plain", String(c.id));
                      const rowEl = e.currentTarget.closest("tr");
                      if (rowEl) e.dataTransfer.setDragImage(rowEl, 20, 12);
                    }}
                    onDragEnd={handleRowDragEnd}
                    title="Drag to reorder this row"
                  >
                    ⠿
                  </td>
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
                  {orderedCols.map((col, vi) =>
                    renderDataCell(col, rowIndex, vi, c)
                  )}
                  <td>
                    <button
                      type="button"
                      title="Payment statement (image / PDF)"
                      className="mr-1 rounded border border-border bg-secondary px-2 py-1 text-xs"
                      onClick={() => setStatementId(c.id)}
                    >
                      🧾
                    </button>
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
          {!list.length && !loadingPage && <EmptyDataNotice message="No candidates found." />}
          {!list.length && loadingPage && <InlineLoading label="Loading candidates…" lines={8} />}
        </div>
        {matchCount > 0 && (
          <PageBar
            position="bottom"
            pageStart={pageStart}
            shown={list.length}
            matchCount={matchCount}
            pageSize={pageSize}
            changePageSize={changePageSize}
            curPage={curPage}
            totalPages={totalPages}
            setPage={setPage}
          />
        )}
      </div>

      {bulkSelected.size > 0 && (
        <BulkBar list={list} />
      )}

      {statementCandidate && (
        <StatementModal
          candidate={statementCandidate}
          onClose={() => setStatementId(null)}
        />
      )}

      {pasteProgress && (
        <div className="fixed inset-0 z-5000 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-[20px] border border-border bg-card p-6 text-center shadow-2xl">
            <div className="mb-3 text-2xl">📋</div>
            <div className="mb-1 text-sm font-semibold">Creating new candidates…</div>
            <div className="mb-4 text-xs text-muted">
              {pasteProgress.done} of {pasteProgress.total} done
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-secondary">
              <div
                className="h-full rounded-full bg-primary transition-[width] duration-150"
                style={{
                  width: `${Math.round((pasteProgress.done / pasteProgress.total) * 100)}%`,
                }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Rows-per-page + Prev/Next bar. Shown above and below the sheet so you never
// have to scroll to the bottom just to change page.
function PageBar({
  position,
  pageStart,
  shown,
  matchCount,
  pageSize,
  changePageSize,
  curPage,
  totalPages,
  setPage,
}: {
  position: "top" | "bottom";
  pageStart: number;
  shown: number;
  matchCount: number;
  pageSize: number;
  changePageSize: (n: number) => void;
  curPage: number;
  totalPages: number;
  setPage: (n: number) => void;
}) {
  return (
    <div
      className={`flex flex-wrap items-center justify-between gap-2 border-border bg-card px-3 py-2 text-xs text-muted ${
        position === "top" ? "border-b" : "border-t"
      }`}
    >
      <span>
        Showing {pageStart + 1}–{pageStart + shown} of {matchCount}
      </span>
      <div className="flex items-center gap-2">
        <label className="flex items-center gap-1">
          Rows per page
          <select
            value={pageSize}
            onChange={(e) => changePageSize(Number(e.target.value))}
            className="rounded border border-border bg-card px-1.5 py-1 text-card-foreground"
          >
            <option value={50}>50</option>
            <option value={100}>100</option>
            <option value={500}>500</option>
            <option value={0}>All</option>
          </select>
        </label>
        {pageSize !== 0 && (
          <>
            <button
              type="button"
              disabled={curPage === 0}
              onClick={() => setPage(curPage - 1)}
              className="rounded border border-border px-2 py-1 disabled:opacity-40"
            >
              ‹ Prev
            </button>
            <span>
              Page {curPage + 1} / {totalPages}
            </span>
            <button
              type="button"
              disabled={curPage >= totalPages - 1}
              onClick={() => setPage(curPage + 1)}
              className="rounded border border-border px-2 py-1 disabled:opacity-40"
            >
              Next ›
            </button>
          </>
        )}
      </div>
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
    assignableUsers,
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
    <div className="fixed bottom-4 left-1/2 z-3900 flex w-[min(1180px,calc(100vw-28px))] -translate-x-1/2 flex-wrap items-center gap-2 rounded-[20px] border border-border bg-card px-3.5 py-3 shadow-2xl">
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
            assignedTo: e.target.value,
          }));
          e.target.value = "";
          toast("Bulk update completed", "success");
        }}
      >
        <option value="">Change Assigned</option>
        {assignableUsers.map((name) => (
          <option key={name}>{name}</option>
        ))}
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
