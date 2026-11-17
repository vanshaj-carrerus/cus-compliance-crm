"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import type {
  ActiveFilters,
  Candidate,
  CrmSettings,
  CrmView,
  PaymentHistory,
  SaveState,
  ToastItem,
  ToastType,
} from "@/lib/crm/types";
import {
  normalizeCandidate,
  parseInstallment,
  newId,
  defaultSettings,
  mergeSettings,
} from "@/lib/crm/normalize";
import { getRemaining, nextUnpaid, applyPaidAmount } from "@/lib/crm/calc";
import { todayIso, addDays } from "@/lib/crm/dates";
import { filterCandidates } from "@/lib/crm/incentive";
import { runWorkflows as runWorkflowsFn } from "@/lib/crm/workflows";
import {
  clearCrmCache,
  ensureCrmBootstrap,
  fetchCrmSnapshot,
  peekCrmCache,
  setCrmCache,
} from "@/lib/crm-cache";
import {
  SyncEngine,
  type CellSync,
  type ReconcileResult,
  type SyncStatus,
} from "@/lib/crm/sync-engine";
import { useAuth } from "./AuthProvider";
import {
  isRestorableField,
  adoptOrphanFormDraft,
  releaseKeys,
  takeOrphanCellDrafts,
  writeCellDrafts,
  writeFormDraft,
  type CellDraft,
} from "@/lib/crm/drafts";

interface Snapshot {
  candidates: Candidate[];
  history: PaymentHistory[];
  settings: CrmSettings;
}

interface CrmContextValue {
  ready: boolean;
  error: string | null;
  candidates: Candidate[];
  history: PaymentHistory[];
  settings: CrmSettings;
  currentView: CrmView;
  searchQuery: string;
  activeFilters: ActiveFilters;
  saveState: SaveState;
  toasts: ToastItem[];
  assignableUsers: string[];
  sidebarOpen: boolean;
  sidebarCollapsed: boolean;
  bulkSelected: Set<string>;
  dailyCategory: string;
  dailyFilters: ActiveFilters;
  dailySelected: Set<string>;
  smartFilter: { type: string; amount?: number } | null;
  editingId: number | null;
  candidateModalOpen: boolean;
  importModalOpen: boolean;
  setSidebarOpen: (v: boolean) => void;
  setSidebarCollapsed: (v: boolean) => void;
  toggleSidebar: () => void;
  navigate: (view: CrmView) => void;
  setSearchQuery: (q: string) => void;
  setActiveFilters: (f: ActiveFilters) => void;
  setDailyCategory: (c: string) => void;
  setDailyFilters: (f: ActiveFilters) => void;
  setSmartFilter: (f: { type: string; amount?: number } | null) => void;
  toast: (msg: string, type?: ToastType) => void;
  filtered: (list?: Candidate[]) => Candidate[];
  snapshot: () => void;
  undo: () => void;
  redo: () => void;
  queueSave: () => void;
  saveNow: () => Promise<void>;
  /** Save everything to MongoDB now; resolves true once fully confirmed. */
  flushSave: () => Promise<boolean>;
  /** Flush, then re-read MongoDB and re-send anything that did not land. */
  saveAndVerify: () => Promise<boolean>;
  verifying: boolean;
  /** Re-read everything from the database (saves local edits first). */
  refreshData: () => Promise<boolean>;
  refreshing: boolean;
  syncStatus: SyncStatus;
  /** Per-cell save state ("dirty" | "saving" | "error" | undefined). */
  cellSync: (id: number, field: string) => CellSync | undefined;
  /** True while anything typed/edited is not yet confirmed by MongoDB. */
  hasUnsavedWork: () => boolean;
  /** Blur the focused cell so a half-typed value is committed first. */
  commitActiveEdit: () => void;
  setCandidates: (c: Candidate[]) => void;
  setHistory: (h: PaymentHistory[]) => void;
  setSettings: (s: CrmSettings) => void;
  updateSettings: (partial: Partial<CrmSettings>) => void;
  showAddModal: () => void;
  editCandidate: (id: number) => void;
  closeModals: () => void;
  setImportModalOpen: (v: boolean) => void;
  saveCandidateForm: (data: Partial<Candidate>) => void;
  deleteCandidate: (id: number) => void;
  deleteAllCandidates: () => void;
  duplicateLast: () => void;
  addBlankRow: (position?: "top" | "bottom") => void;
  updateMasterField: (
    id: number,
    field: string,
    value: string | number | boolean
  ) => void;
  updateInstallment: (id: number, idx: number, value: string) => void;
  togglePaid: (id: number, idx: number, paid: boolean) => void;
  setPaidAmount: (id: number, targetAmount: number) => void;
  markContacted: (id: number) => void;
  updateContactField: (id: number, field: string, value: string) => void;
  setBulkSelected: (s: Set<string>) => void;
  setDailySelected: (s: Set<string>) => void;
  replaceAll: (
    candidates: Candidate[],
    history: PaymentHistory[],
    settings: CrmSettings
  ) => Promise<void>;
  resetAll: () => void;
  runWorkflows: (manual?: boolean) => void;
  dbSizeKb: string;
  undoCount: number;
}

const CrmContext = createContext<CrmContextValue | null>(null);

export function useCrm() {
  const ctx = useContext(CrmContext);
  if (!ctx) throw new Error("useCrm must be used within CrmProvider");
  return ctx;
}

function fireBrowserNotification(title: string, body: string) {
  if (typeof window === "undefined" || !("Notification" in window)) return;
  if (Notification.permission !== "granted") return;
  try {
    new Notification(title, { body });
  } catch {
    /* ignore — some browsers block Notification constructors */
  }
}

export function CrmProvider({
  children,
  initialView = "dashboard",
  routeView,
  onNavigate,
}: {
  children: React.ReactNode;
  initialView?: CrmView;
  /** Keep currentView in sync with the URL without remounting this provider. */
  routeView?: CrmView;
  onNavigate?: (view: CrmView) => void;
}) {
  const boot = peekCrmCache();
  const [ready, setReady] = useState(Boolean(boot));
  const [error, setError] = useState<string | null>(null);
  // true once the sync engine knows what MongoDB holds (and the journal was replayed)
  const [booted, setBooted] = useState(false);
  const [candidates, setCandidatesState] = useState<Candidate[]>(
    boot?.candidates ?? []
  );
  const [history, setHistoryState] = useState<PaymentHistory[]>(
    boot?.history ?? []
  );
  const [settings, setSettingsState] = useState<CrmSettings>(
    boot?.settings ?? defaultSettings()
  );
  const [currentView, setCurrentView] = useState<CrmView>(initialView);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeFilters, setActiveFilters] = useState<ActiveFilters>({});
  const { user } = useAuth();
  const [syncStatus, setSyncStatus] = useState<SyncStatus>({
    phase: "idle",
    pending: 0,
    done: 0,
    lastSavedAt: null,
    error: null,
    retryAt: null,
    journalFailed: false,
  });
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [assignableUsers, setAssignableUsers] = useState<string[]>([]);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(true);
  const [bulkSelected, setBulkSelected] = useState<Set<string>>(new Set());
  const [dailyCategory, setDailyCategory] = useState("overdue");
  const [dailyFilters, setDailyFilters] = useState<ActiveFilters>({});
  const [dailySelected, setDailySelected] = useState<Set<string>>(new Set());
  const [smartFilter, setSmartFilter] = useState<{
    type: string;
    amount?: number;
  } | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [candidateModalOpen, setCandidateModalOpen] = useState(false);
  const [importModalOpen, setImportModalOpen] = useState(false);

  const undoStack = useRef<string[]>([]);
  const redoStack = useRef<string[]>([]);
  // The live source of truth for every mutation. Handlers read from (and
  // write to) this ref instead of the render-time `candidates` closure, so
  // two edits that land before React re-renders can't overwrite each other
  // with a stale copy. It is only ever replaced by the setters below - never
  // by an effect copying render state back (which could clobber a newer edit).
  const stateRef = useRef<Snapshot>({
    candidates: boot?.candidates ?? [],
    history: boot?.history ?? [],
    settings: boot?.settings ?? defaultSettings(),
  });
  // Cells with typed-but-not-yet-committed text (uncontrolled inputs commit
  // on blur). Used by the "unsaved changes" guard.
  const uncommitted = useRef<Set<Element>>(new Set());
  // Latest save-and-verify, reachable from listeners declared before it.
  const saveVerifyRef = useRef<() => Promise<boolean>>(async () => false);
  const userKey = user?.id || user?.email || "anon";
  // Text typed into a cell, mirrored to localStorage on every keystroke
  // until the cell commits into state (which journals it itself).
  const cellDrafts = useRef<Record<string, CellDraft>>({});

  // All persistence goes through this engine: it diffs against what MongoDB
  // last confirmed, journals pending edits to localStorage, and retries until
  // everything is saved.
  const [engine] = useState(
    () =>
      new SyncEngine({
        userKey: user?.id || user?.email || "anon",
        onChange: (st) => setSyncStatus(st),
        onDirty: () => clearCrmCache(),
        onIdle: (snap) => setCrmCache({ ...snap }),
      })
  );
  const saveState: SaveState =
    syncStatus.phase === "saving" || syncStatus.phase === "dirty"
      ? "saving"
      : syncStatus.phase === "retrying" || syncStatus.phase === "auth"
        ? "error"
        : ready
          ? "saved"
          : "idle";

  useEffect(() => {
    if (routeView && routeView !== currentView) {
      setCurrentView(routeView);
      setSidebarOpen(false);
      setSidebarCollapsed(true);
    }
    // Only react to URL changes — not to local currentView updates from navigate().
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeView]);

  // Browser back/forward after client-side pushState (no Next.js navigation).
  useEffect(() => {
    const onPopState = () => {
      const segment =
        window.location.pathname.replace(/^\//, "").split("/")[0] ||
        "dashboard";
      setCurrentView(segment as CrmView);
      setSidebarOpen(false);
      setSidebarCollapsed(true);
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  useEffect(() => {
    try {
      const stored = localStorage.getItem("crm-sidebar-collapsed");
      if (stored === "0") {
        setSidebarCollapsed(false);
        setSidebarOpen(true);
      } else {
        setSidebarCollapsed(true);
        setSidebarOpen(false);
      }
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(
        "crm-sidebar-collapsed",
        sidebarCollapsed ? "1" : "0"
      );
    } catch {
      /* ignore */
    }
  }, [sidebarCollapsed]);

  const toggleSidebar = useCallback(() => {
    setSidebarCollapsed((c) => {
      const next = !c;
      setSidebarOpen(!next);
      return next;
    });
  }, []);

  const toast = useCallback((msg: string, type: ToastType = "info") => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, message: msg, type }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3000);
  }, []);

  const queueSave = useCallback(() => {
    engine.markChanged();
  }, [engine]);

  const flushSave = useCallback(() => engine.flush(), [engine]);

  const saveNow = useCallback(async () => {
    const ok = await engine.flush();
    if (ok) toast("Saved to database", "success");
    else
      toast(
        "Not saved yet - still retrying. Your data is kept on this device.",
        "error"
      );
  }, [engine, toast]);

  const cellSync = useCallback(
    (id: number, field: string) => engine.cellState(id, field),
    // syncStatus changes whenever the dirty/in-flight sets do
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [engine, syncStatus]
  );

  const commitActiveEdit = useCallback(() => {
    const el = document.activeElement;
    if (
      (el instanceof HTMLInputElement ||
        el instanceof HTMLTextAreaElement ||
        el instanceof HTMLSelectElement) &&
      el.classList.contains("sheet-cell")
    ) {
      el.blur(); // fires the cell's onBlur -> updateMasterField -> queueSave
    }
  }, []);

  const hasUnsavedWork = useCallback(() => {
    let typing = false;
    for (const el of uncommitted.current) {
      if (el.isConnected) typing = true;
      else uncommitted.current.delete(el);
    }
    return typing || engine.hasUnsaved();
  }, [engine]);

  const snapshot = useCallback(() => {
    undoStack.current.push(JSON.stringify(stateRef.current));
    if (undoStack.current.length > 50) undoStack.current.shift();
    redoStack.current = [];
  }, []);

  const restoreSnapshot = useCallback(
    (raw: string) => {
      const s = JSON.parse(raw) as Snapshot;
      const c = s.candidates.map((x) => normalizeCandidate(x));
      setCandidatesState(c);
      setHistoryState(s.history || []);
      setSettingsState(mergeSettings(s.settings));
      stateRef.current = {
        candidates: c,
        history: s.history || [],
        settings: mergeSettings(s.settings),
      };
      queueSave();
    },
    [queueSave]
  );

  const undo = useCallback(() => {
    if (!undoStack.current.length) return toast("Nothing to undo", "info");
    redoStack.current.push(JSON.stringify(stateRef.current));
    restoreSnapshot(undoStack.current.pop()!);
    toast("Undo successful", "success");
  }, [restoreSnapshot, toast]);

  const redo = useCallback(() => {
    if (!redoStack.current.length) return toast("Nothing to redo", "info");
    undoStack.current.push(JSON.stringify(stateRef.current));
    restoreSnapshot(redoStack.current.pop()!);
    toast("Redo successful", "success");
  }, [restoreSnapshot, toast]);

  useEffect(() => {
    let cancelled = false;
    engine.bind(() => stateRef.current);
    (async () => {
      try {
        const data = peekCrmCache() ?? (await ensureCrmBootstrap());
        if (cancelled) return;
        // `data` is what MongoDB holds. Anything typed earlier that never got
        // confirmed (refresh, crash, expired session...) is still in the local
        // journal: lay it back over the server copy and keep saving it.
        engine.setBase(data);
        const { snapshot: merged, count, keys } = engine.recoverFrom(data);
        stateRef.current = merged;
        setCandidatesState(merged.candidates);
        setHistoryState(merged.history);
        setSettingsState(merged.settings);
        setReady(true);
        setBooted(true);
        if (keys.length) {
          // Re-journal under THIS tab first, only then release the old copy.
          engine.markChanged();
          engine.releaseOrphans(keys);
        }
        if (count > 0) {
          toast(
            `Recovered ${count} unsaved change${count > 1 ? "s" : ""} from this device - saving now`,
            "info"
          );
        }
      } catch (e) {
        console.error(e);
        if (!cancelled) {
          setError(
            e instanceof Error
              ? e.message
              : "Failed to load CRM. Is MongoDB running?"
          );
          setReady(true);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Last line of defence against losing typed data: warn before refresh /
  // close, push whatever is pending with a keepalive request, and retry as
  // soon as the browser is back online or the tab is refocused.
  useEffect(() => {
    const track = (e: Event) => {
      const t = e.target;
      if (!(t instanceof Element)) return;
      if (t.classList.contains("sheet-cell") || t.closest("[data-track-unsaved]")) {
        uncommitted.current.add(t);
      }
      // Mirror the keystroke into localStorage right now (synchronous).
      const td = t.closest("td[data-cid]") as HTMLElement | null;
      if (
        td &&
        (t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement) &&
        t.type !== "checkbox"
      ) {
        const field = td.dataset.field || "";
        const id = Number(td.dataset.cid);
        if (field && isRestorableField(field) && Number.isFinite(id)) {
          cellDrafts.current[id + "|" + field] = {
            id,
            field,
            value: t.value,
            ts: Date.now(),
          };
          writeCellDrafts(userKey, cellDrafts.current);
        }
      }
    };
    const untrack = (e: Event) => {
      const t = e.target;
      // Sheet cells commit on blur; form fields stay "unsaved" until their
      // modal is closed (the element is then removed from the DOM).
      if (t instanceof Element && !t.closest("[data-track-unsaved]")) {
        uncommitted.current.delete(t);
      }
      // The cell's onBlur has committed it into state (and the journal) by
      // the time this timeout fires, so its draft is no longer needed.
      const td =
        t instanceof Element
          ? (t.closest("td[data-cid]") as HTMLElement | null)
          : null;
      if (td) {
        const k = Number(td.dataset.cid) + "|" + (td.dataset.field || "");
        setTimeout(() => {
          if (!cellDrafts.current[k]) return;
          delete cellDrafts.current[k];
          writeCellDrafts(userKey, cellDrafts.current);
        }, 0);
      }
    };
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      commitActiveEdit();
      engine.flushOnExit();
      if (hasUnsavedWork()) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    const onPageHide = () => {
      commitActiveEdit();
      engine.flushOnExit();
      engine.markTabClosing();
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") engine.flushOnExit();
      else engine.nudge();
    };
    const onOnline = () => engine.nudge();
    engine.activate();
    document.addEventListener("input", track, true);
    document.addEventListener("focusout", untrack, true);
    window.addEventListener("beforeunload", onBeforeUnload);
    window.addEventListener("pagehide", onPageHide);
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("online", onOnline);
    return () => {
      document.removeEventListener("input", track, true);
      document.removeEventListener("focusout", untrack, true);
      window.removeEventListener("beforeunload", onBeforeUnload);
      window.removeEventListener("pagehide", onPageHide);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("online", onOnline);
      engine.dispose();
    };
  }, [engine, commitActiveEdit, hasUnsavedWork, userKey]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/crm/assignees");
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled) setAssignableUsers(data.assignees || []);
      } catch (e) {
        console.error(e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing =
        e.target instanceof HTMLElement &&
        e.target.matches("input,textarea,select,[contenteditable='true']");
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z" && !typing) {
        e.preventDefault();
        undo();
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y" && !typing) {
        e.preventDefault();
        redo();
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        void saveVerifyRef.current();
      }
      if (e.key === "Escape") {
        setCandidateModalOpen(false);
        setImportModalOpen(false);
        setEditingId(null);
        setSidebarOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [undo, redo]);

  const applyWorkflowResult = useCallback(
    (
      result: ReturnType<typeof runWorkflowsFn>,
      opts: { manual?: boolean; notify?: boolean } = {}
    ) => {
      if (result.changed > 0 || opts.manual) {
        if (opts.manual) snapshot();
        setCandidatesState(result.candidates);
        setSettingsState(result.settings);
        stateRef.current.candidates = result.candidates;
        stateRef.current.settings = result.settings;
        queueSave();
      }
      if (opts.notify) {
        if (result.overdueNotify > 0) {
          fireBrowserNotification(
            "CareerUS — Overdue payments",
            `${result.overdueNotify} candidate(s) need follow-up`
          );
        }
        if (result.followNotify > 0) {
          fireBrowserNotification(
            "CareerUS — Follow-ups due",
            `${result.followNotify} follow-up(s) due today`
          );
        }
      }
      return result;
    },
    [queueSave, snapshot]
  );

  useEffect(() => {
    const t = setInterval(() => {
      if (!ready) return;
      const result = runWorkflowsFn(
        stateRef.current.candidates,
        stateRef.current.settings,
        false
      );
      applyWorkflowResult(result, { notify: true });
    }, 15 * 60 * 1000);
    return () => clearInterval(t);
  }, [ready, applyWorkflowResult]);

  const filtered = useCallback(
    (list = candidates) =>
      filterCandidates(list, searchQuery, activeFilters),
    [candidates, searchQuery, activeFilters]
  );

  const setCandidates = (c: Candidate[]) => {
    setCandidatesState(c);
    stateRef.current.candidates = c;
  };
  const setHistory = (h: PaymentHistory[]) => {
    setHistoryState(h);
    stateRef.current.history = h;
  };
  const setSettings = (s: CrmSettings) => {
    setSettingsState(s);
    stateRef.current.settings = s;
  };

  const updateSettings = (partial: Partial<CrmSettings>) => {
    const { settings } = stateRef.current;
    snapshot();
    const next = { ...settings, ...partial };
    setSettings(next);
    queueSave();
  };

  const showAddModal = () => {
    setEditingId(null);
    setCandidateModalOpen(true);
  };
  const editCandidate = (id: number) => {
    setEditingId(id);
    setCandidateModalOpen(true);
  };
  const closeModals = () => {
    writeFormDraft(userKey, null);
    setCandidateModalOpen(false);
    setImportModalOpen(false);
    setEditingId(null);
  };

  const saveCandidateForm = (data: Partial<Candidate>) => {
    const { candidates } = stateRef.current;
    const name = String(data.name || "").trim();
    if (!name) return toast("Candidate name is required", "error");
    snapshot();
    const old = candidates.find((x) => x.id === editingId);
    const c = normalizeCandidate({
      id: editingId || newId(),
      ...old,
      ...data,
      name,
      installments: data.installments ?? old?.installments,
      createdAt: old ? old.createdAt : undefined,
    });
    if (old) {
      setCandidates(candidates.map((x) => (x.id === old.id ? c : x)));
    } else {
      setCandidates([...candidates, c]);
    }
    queueSave();
    closeModals();
    toast(old ? "Candidate updated" : "Candidate added", "success");
  };

  const deleteCandidate = (id: number) => {
    const { candidates, history } = stateRef.current;
    const c = candidates.find((x) => x.id === id);
    if (!c) return;
    if (
      !confirm(
        `Delete ${c.name || "this candidate"}? This will remove the candidate from Master, Compliance, Target and Incentive views.`
      )
    )
      return;
    snapshot();
    setCandidates(candidates.filter((x) => x.id !== id));
    setHistory(history.filter((h) => h.candidateId !== id));
    queueSave();
    toast("Candidate deleted", "success");
  };

  const deleteAllCandidates = () => {
    const { candidates } = stateRef.current;
    if (!candidates.length) return toast("No candidates to delete", "info");
    if (!confirm("Delete ALL candidates from Master P.O Sheet?")) return;
    if (
      !confirm(
        "Final confirmation: this will remove all candidates and their payment history. Backup first if needed."
      )
    )
      return;
    snapshot();
    setCandidates([]);
    setHistory([]);
    queueSave();
    toast("All candidates deleted", "success");
  };

  const duplicateLast = () => {
    const { candidates } = stateRef.current;
    if (!candidates.length) return toast("No candidate to duplicate", "info");
    snapshot();
    const last = candidates[candidates.length - 1];
    const dup = normalizeCandidate({
      ...last,
      id: newId(),
      name: (last.name || "Candidate") + " Copy",
      installments: undefined,
      createdAt: new Date().toISOString(),
    });
    setCandidates([...candidates, dup]);
    queueSave();
    toast("Candidate duplicated", "success");
  };

  // Inserts one blank candidate at the front or back of the list, giving
  // the sheet a paste anchor beyond the existing rows - pasting a block
  // that starts on this row overwrites it and auto-creates any further
  // overflow rows (see MasterSheet's paste handling).
  const addBlankRow = (position: "top" | "bottom" = "bottom") => {
    const { candidates } = stateRef.current;
    snapshot();
    const blank = normalizeCandidate({ id: newId() });
    setCandidates(position === "top" ? [blank, ...candidates] : [...candidates, blank]);
    queueSave();
    toast(`Blank row added to ${position === "top" ? "top" : "bottom"}`, "success");
  };

  const updateMasterField = (
    id: number,
    field: string,
    value: string | number | boolean
  ) => {
    const { candidates } = stateRef.current;
    const idx = candidates.findIndex((x) => x.id === id);
    if (idx < 0) return;
    snapshot();
    const c = { ...candidates[idx] };
    const numFields = [
      "annualPackage",
      "serviceFeePercent",
      "installmentCount",
      "totalServiceFee",
    ];
    if (numFields.includes(field)) {
      (c as Record<string, unknown>)[field] =
        Number(String(value).replace(/[$,%\s,]/g, "")) || 0;
      // normalizeCandidate recomputes totalServiceFee from
      // annualPackage x serviceFeePercent whenever both are non-zero,
      // which would silently discard a directly typed/pasted Total.
      // Editing Total here means "use this flat amount", so clear the
      // pair that would otherwise override it.
      if (field === "totalServiceFee") {
        c.annualPackage = 0;
        c.serviceFeePercent = 0;
      }
    } else {
      (c as Record<string, unknown>)[field] = value;
    }
    if (
      field === "status" &&
      ["Run Away", "Not Responding"].includes(String(value))
    ) {
      c.nextFollowUpDate = addDays(todayIso(), 7);
    }
    const next = [...candidates];
    next[idx] = normalizeCandidate(c);
    setCandidates(next);
    queueSave();
  };

  const updateInstallment = (id: number, idx: number, value: string) => {
    const { candidates, history } = stateRef.current;
    const ci = candidates.findIndex((x) => x.id === id);
    if (ci < 0) return;
    snapshot();
    const c = { ...candidates[ci], installments: [...candidates[ci].installments] };
    const old = c.installments[idx] || normalizeCandidate({}).installments[0];
    const parsed = parseInstallment(value);
    const paid =
      old.paid ||
      (!!parsed.amount && Number(parsed.amount) > 0 && !old.amount);
    c.installments[idx] = {
      ...old,
      ...parsed,
      paid,
      paymentDate: paid
        ? old.paymentDate || parsed.date || todayIso()
        : old.paymentDate,
      receipt: old.receipt || "",
      notes: old.notes || "",
    };
    if (paid && !old.paid && (Number(c.installments[idx].amount) || 0) > 0) {
      setHistory([
        ...history,
        {
          id: newId(),
          candidateId: id,
          candidateName: c.name,
          assignedTo: c.assignedTo,
          floor: c.floor,
          date: c.installments[idx].paymentDate || todayIso(),
          amount: Number(c.installments[idx].amount) || 0,
          type: "Payment",
          notes: "Installment " + (idx + 1),
          timestamp: new Date().toISOString(),
        },
      ]);
    }
    const next = [...candidates];
    next[ci] = normalizeCandidate(c);
    setCandidates(next);
    queueSave();
  };

  const togglePaid = (id: number, idx: number, paid: boolean) => {
    const { candidates, history } = stateRef.current;
    const ci = candidates.findIndex((x) => x.id === id);
    if (ci < 0) return;
    snapshot();
    const c = { ...candidates[ci], installments: [...candidates[ci].installments] };
    const i = { ...c.installments[idx] };
    const was = i.paid;
    i.paid = paid;
    if (paid && !was) {
      i.paymentDate = i.paymentDate || i.date || todayIso();
      if ((Number(i.amount) || 0) > 0) {
        setHistory([
          ...history,
          {
            id: newId(),
            candidateId: id,
            candidateName: c.name,
            assignedTo: c.assignedTo,
            floor: c.floor,
            date: i.paymentDate,
            amount: Number(i.amount) || 0,
            type: "Payment",
            notes: "Installment " + (idx + 1),
            timestamp: new Date().toISOString(),
          },
        ]);
      }
    }
    c.installments[idx] = i;
    let normalized = normalizeCandidate(c);
    if (paid && getRemaining(normalized) > 0) {
      const n = nextUnpaid(normalized);
      if (n) normalized = { ...normalized, nextFollowUpDate: addDays(i.paymentDate || todayIso(), 20) };
    }
    const next = [...candidates];
    next[ci] = normalized;
    setCandidates(next);
    queueSave();
    toast(paid ? "Payment marked paid" : "Payment marked unpaid", "success");
  };

  // Backs the Paid cell on Compliance/Payment Target: typing a new total
  // there marks/unmarks this candidate's installments (earliest first, same
  // order as the schedule) until their paid sum matches what was typed,
  // rather than storing a disconnected number - Paid always stays "sum of
  // paid installments" everywhere else that reads it.
  const setPaidAmount = (id: number, targetAmount: number) => {
    const { candidates, history } = stateRef.current;
    const ci = candidates.findIndex((x) => x.id === id);
    if (ci < 0) return;
    snapshot();
    const c = { ...candidates[ci], installments: [...candidates[ci].installments] };
    const newlyPaid = applyPaidAmount(c, targetAmount);
    if (newlyPaid.length) {
      setHistory([
        ...history,
        ...newlyPaid.map(({ idx, amount }) => ({
          id: newId(),
          candidateId: id,
          candidateName: c.name,
          assignedTo: c.assignedTo,
          floor: c.floor,
          date: c.installments[idx].paymentDate || todayIso(),
          amount,
          type: "Payment" as const,
          notes: "Installment " + (idx + 1),
          timestamp: new Date().toISOString(),
        })),
      ]);
    }
    const next = [...candidates];
    next[ci] = normalizeCandidate(c);
    setCandidates(next);
    queueSave();
    toast("Paid amount updated", "success");
  };

  const markContacted = (id: number) => {
    const { candidates, history } = stateRef.current;
    const ci = candidates.findIndex((x) => String(x.id) === String(id));
    if (ci < 0) return;
    snapshot();
    const c = { ...candidates[ci] };
    c.lastContactDate = todayIso();
    if (c.contactMethod === "No Contact") c.contactMethod = "Call";
    const next = [...candidates];
    next[ci] = normalizeCandidate(c);
    setCandidates(next);
    setHistory([
      ...history,
      {
        id: newId(),
        candidateId: c.id,
        candidateName: c.name,
        assignedTo: c.assignedTo,
        floor: c.floor,
        date: todayIso(),
        amount: 0,
        type: "Contact",
        notes: "Marked contacted",
        timestamp: new Date().toISOString(),
      },
    ]);
    queueSave();
    toast("Contact logged for " + (c.name || "candidate"), "success");
  };

  const updateContactField = (id: number, field: string, value: string) => {
    const { candidates } = stateRef.current;
    const ci = candidates.findIndex((x) => String(x.id) === String(id));
    if (ci < 0) return;
    snapshot();
    const c = { ...candidates[ci], [field]: String(value || "") };
    const next = [...candidates];
    next[ci] = normalizeCandidate(c);
    setCandidates(next);
    queueSave();
  };

  // Import / restore. A MERGE, not a wipe: candidates and history rows in
  // the file are laid over the current data by id, everything else stays.
  // The engine then sends only what really differs from the database - new
  // candidates whole, changed ones as field patches - so an old file can
  // never erase what other users added or changed in fields it doesn't touch.
  const replaceAll = async (
    c: Candidate[],
    h: PaymentHistory[],
    s: CrmSettings
  ) => {
    snapshot();
    const cur = stateRef.current;
    const fileC = new Map(c.map((x) => [x.id, x]));
    const known = new Set(cur.candidates.map((x) => x.id));
    const nextC = [
      ...cur.candidates.map((x) => fileC.get(x.id) ?? x),
      ...c.filter((x) => !known.has(x.id)),
    ];
    const fileH = new Map(h.map((x) => [x.id, x]));
    const knownH = new Set(cur.history.map((x) => x.id));
    const nextH = [
      ...cur.history.map((x) => fileH.get(x.id) ?? x),
      ...h.filter((x) => !knownH.has(x.id)),
    ];
    setCandidates(nextC);
    setHistory(nextH);
    setSettings(s);
    stateRef.current = { candidates: nextC, history: nextH, settings: s };
    engine.markChanged();
    const added = c.filter((x) => !known.has(x.id)).length;
    const ok = await engine.flush();
    toast(
      ok
        ? `Import saved - ${c.length - added} updated, ${added} new`
        : "Imported locally - still saving to the database",
      ok ? "success" : "info"
    );
  };

  const resetAll = () => {
    if (!confirm("Delete ALL CRM data?")) return;
    if (!confirm("Final confirmation: this cannot be undone.")) return;
    snapshot();
    const emptySettings = defaultSettings();
    setCandidates([]);
    setHistory([]);
    setSettings(emptySettings);
    queueSave();
    toast("All data reset", "info");
  };

  const runWorkflows = (manual = false) => {
    const { candidates, settings } = stateRef.current;
    const result = applyWorkflowResult(
      runWorkflowsFn(candidates, settings, manual),
      { manual, notify: true }
    );
    if (manual) {
      toast(
        result.changed
          ? result.changed + " workflow action(s) completed"
          : "Workflows checked — no new actions",
        "success"
      );
    }
  };

  // Pull in unsaved work left behind by tabs that are no longer alive:
  // their journals, half-typed cells and half-filled candidate form. Runs at
  // start-up, shortly after (a crashed tab's heartbeat needs a few seconds
  // to expire) and then periodically.
  const adoptOrphans = () => {
    if (!booted) return;
    let changed = 0;

    const { drafts, keys: draftKeys } = takeOrphanCellDrafts(userKey);
    for (const d of drafts) {
      const cand = stateRef.current.candidates.find((x) => x.id === d.id);
      if (!cand) continue;
      if (/^inst\d+$/.test(d.field)) {
        updateInstallment(d.id, Number(d.field.slice(4)), d.value);
      } else if (d.field === "lastContactDate") {
        updateContactField(d.id, d.field, d.value);
      } else {
        updateMasterField(d.id, d.field, d.value);
      }
      changed++;
    }

    const rec = engine.recoverFrom(stateRef.current, { protectDirty: true });
    if (rec.count > 0) {
      stateRef.current = rec.snapshot;
      setCandidatesState(rec.snapshot.candidates);
      setHistoryState(rec.snapshot.history);
      setSettingsState(rec.snapshot.settings);
      changed += rec.count;
    }

    if (changed > 0 || rec.keys.length || draftKeys.length) {
      engine.markChanged(); // journals everything under THIS tab first
      releaseKeys(draftKeys);
      engine.releaseOrphans(rec.keys);
    }
    if (changed > 0) {
      toast(
        `Recovered ${changed} unsaved change${changed > 1 ? "s" : ""} from this device - saving now`,
        "info"
      );
    }

    const formDraft = adoptOrphanFormDraft(userKey);
    if (formDraft && !candidateModalOpen) {
      setEditingId(formDraft.editingId);
      setCandidateModalOpen(true);
      toast("Restored the candidate form you were filling in", "info");
    }
  };

  const adoptRef = useRef(adoptOrphans);
  useEffect(() => {
    adoptRef.current = adoptOrphans;
  });
  useEffect(() => {
    if (!booted) return;
    adoptRef.current();
    const first = setTimeout(() => adoptRef.current(), 8000);
    const t = setInterval(() => adoptRef.current(), 30000);
    return () => {
      clearTimeout(first);
      clearInterval(t);
    };
  }, [booted]);

  // Verify against the real database: save everything, re-read MongoDB and
  // compare. Anything of ours that is missing/different is sent again; what
  // other people changed is adopted. Repeats until clean (max 3 rounds).
  const [verifying, setVerifying] = useState(false);
  const verifyRunning = useRef(false);
  // Lay what the engine took over from the database onto the screen.
  const applyAdoption = (r: ReconcileResult): number => {
    const n =
      r.adoptCandidates.length +
      r.removeCandidateIds.length +
      r.adoptHistory.length +
      r.removeHistoryIds.length +
      (r.adoptSettings ? 1 : 0);
    if (!n) return 0;
    const cur = stateRef.current;
    const rmC = new Set(r.removeCandidateIds);
    const upC = new Map(r.adoptCandidates.map((c) => [c.id, c]));
    const seen = new Set<number>();
    const nextC = cur.candidates
      .filter((c) => !rmC.has(c.id))
      .map((c) => {
        seen.add(c.id);
        return upC.get(c.id) ?? c;
      });
    for (const c of r.adoptCandidates) if (!seen.has(c.id)) nextC.push(c);
    const rmH = new Set(r.removeHistoryIds);
    const upH = new Map(r.adoptHistory.map((h) => [h.id, h]));
    const seenH = new Set<number>();
    const nextH = cur.history
      .filter((h) => !rmH.has(h.id))
      .map((h) => {
        seenH.add(h.id);
        return upH.get(h.id) ?? h;
      });
    for (const h of r.adoptHistory) if (!seenH.has(h.id)) nextH.push(h);
    stateRef.current = {
      candidates: nextC,
      history: nextH,
      settings: r.adoptSettings ?? cur.settings,
    };
    setCandidatesState(nextC);
    setHistoryState(nextH);
    if (r.adoptSettings) setSettingsState(r.adoptSettings);
    return n;
  };

  // Live updates: every few seconds look at what other people saved and take
  // it over, field by field. Never while there is unsaved work, a save in
  // flight or a half-typed cell - and a snapshot older than a save that
  // finished meanwhile is thrown away.
  const pollRunning = useRef(false);
  const pollOnce = async () => {
    if (pollRunning.current || verifyRunning.current) return;
    if (document.visibilityState !== "visible") return;
    if (engine.status.phase !== "idle" || hasUnsavedWork()) return;
    if (uncommitted.current.size > 0) return;
    pollRunning.current = true;
    try {
      const epoch = engine.getEpoch();
      const server = await fetchCrmSnapshot();
      if (uncommitted.current.size > 0 || verifyRunning.current) return;
      const r = engine.reconcile(server, true, "poll", epoch);
      if (r.stale) return;
      if (applyAdoption(r) > 0) {
        engine.markChanged();
        setCrmCache({ ...stateRef.current });
      }
    } catch {
      /* offline / server busy: try again on the next tick */
    } finally {
      pollRunning.current = false;
    }
  };
  const pollRef = useRef(pollOnce);
  useEffect(() => {
    pollRef.current = pollOnce;
  });
  useEffect(() => {
    if (!booted) return;
    const tick = () => void pollRef.current();
    const t = setInterval(tick, 10_000);
    const onVisible = () => {
      if (document.visibilityState === "visible") tick();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", tick);
    window.addEventListener("online", tick);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", tick);
      window.removeEventListener("online", tick);
    };
  }, [booted]);

  const verifyWithDatabase = async (
      opts: { adopt?: boolean } = {}
    ): Promise<{
      ok: boolean;
      matched: number;
      resent: number;
      adopted: number;
      error?: string;
    }> => {
      if (verifyRunning.current)
        return { ok: false, matched: 0, resent: 0, adopted: 0, error: "Already verifying" };
      verifyRunning.current = true;
      setVerifying(true);
      let resent = 0;
      let adopted = 0;
      try {
        for (let round = 0; round < 5; round++) {
          if (!(await engine.flush())) {
            return {
              ok: false,
              matched: 0,
              resent,
              adopted,
              error: "Could not finish saving - still retrying",
            };
          }
          const epoch = engine.getEpoch();
          const server = await fetchCrmSnapshot();
          const r = engine.reconcile(server, opts.adopt !== false, "verify", epoch);
          if (r.stale) continue; // a save finished while reading: read again
          adopted += applyAdoption(r);
          resent += r.resend;
          if (r.resend === 0) {
            engine.markChanged();
            return { ok: true, matched: r.matched, resent, adopted };
          }
          engine.markChanged();
        }
        return {
          ok: false,
          matched: 0,
          resent,
          adopted,
          error: "Some records did not match after several attempts",
        };
      } catch (e) {
        return {
          ok: false,
          matched: 0,
          resent,
          adopted,
          error: e instanceof Error ? e.message : "Verification failed",
        };
      } finally {
        verifyRunning.current = false;
        setVerifying(false);
      }
    };

  // Save button / Ctrl+S: flush + verify against the database.
  const saveAndVerify = async () => {
    commitActiveEdit();
    await new Promise((r) => setTimeout(r, 0));
    const res = await verifyWithDatabase({ adopt: true });
    if (res.ok) {
      toast(
        `Saved and verified - ${res.matched} candidates match the database${
          res.resent ? ` (${res.resent} re-sent)` : ""
        }${res.adopted ? ` · ${res.adopted} updated from others` : ""}`,
        "success"
      );
    } else {
      toast(
        `Not fully saved: ${res.error || "unknown error"}. Your data is kept on this device and will keep retrying.`,
        "error"
      );
    }
    return res.ok;
  };
  useEffect(() => {
    saveVerifyRef.current = saveAndVerify;
  });

  // "Refresh data" button: save what is local, re-read MongoDB, take over
  // whatever is missing or newer on screen.
  const [refreshing, setRefreshing] = useState(false);
  const refreshData = async () => {
    if (!booted) {
      window.location.reload();
      return false;
    }
    setRefreshing(true);
    try {
      commitActiveEdit();
      const res = await verifyWithDatabase({ adopt: true });
      if (res.ok) {
        setCrmCache({ ...stateRef.current });
        toast(
          `Data refreshed - ${stateRef.current.candidates.length} candidates loaded`,
          "success"
        );
      } else {
        toast(`Could not refresh: ${res.error || "unknown error"}`, "error");
      }
      return res.ok;
    } finally {
      setRefreshing(false);
    }
  };

  const verifyRef = useRef(verifyWithDatabase);
  useEffect(() => {
    verifyRef.current = verifyWithDatabase;
  });

  // Background self-check every 3 minutes while idle and not typing.
  useEffect(() => {
    if (!booted) return;
    const t = setInterval(() => {
      if (document.visibilityState !== "visible") return;
      if (engine.status.phase !== "idle" || hasUnsavedWork()) return;
      const a = document.activeElement;
      if (a instanceof HTMLElement && a.classList.contains("sheet-cell")) return;
      void verifyRef.current({ adopt: true }).then((r) => {
        if (r.ok && (r.resent || r.adopted)) {
          toast(
            `Database check: ${r.resent} re-sent, ${r.adopted} updated from others`,
            "info"
          );
        }
      });
    }, 3 * 60 * 1000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [booted, engine]);

  const dbSizeKb = (
    (JSON.stringify(candidates).length +
      JSON.stringify(history).length +
      JSON.stringify(settings).length) /
    1024
  ).toFixed(1);

  const navigate = useCallback(
    (view: CrmView) => {
      setCurrentView(view);
      setSidebarOpen(false);
      setSidebarCollapsed(true);
      onNavigate?.(view);
    },
    [onNavigate]
  );

  const value: CrmContextValue = {
    ready,
    error,
    candidates,
    history,
    settings,
    currentView,
    searchQuery,
    activeFilters,
    saveState,
    toasts,
    assignableUsers,
    sidebarOpen,
    sidebarCollapsed,
    bulkSelected,
    dailyCategory,
    dailyFilters,
    dailySelected,
    smartFilter,
    editingId,
    candidateModalOpen,
    importModalOpen,
    setSidebarOpen,
    setSidebarCollapsed,
    toggleSidebar,
    navigate,
    setSearchQuery,
    setActiveFilters,
    setDailyCategory,
    setDailyFilters,
    setSmartFilter,
    toast,
    filtered,
    snapshot,
    undo,
    redo,
    queueSave,
    saveNow,
    flushSave,
    saveAndVerify,
    verifying,
    refreshData,
    refreshing,
    syncStatus,
    cellSync,
    hasUnsavedWork,
    commitActiveEdit,
    setCandidates,
    setHistory,
    setSettings,
    updateSettings,
    showAddModal,
    editCandidate,
    closeModals,
    setImportModalOpen,
    saveCandidateForm,
    deleteCandidate,
    deleteAllCandidates,
    duplicateLast,
    addBlankRow,
    updateMasterField,
    updateInstallment,
    togglePaid,
    setPaidAmount,
    markContacted,
    updateContactField,
    setBulkSelected,
    setDailySelected,
    replaceAll,
    resetAll,
    runWorkflows,
    dbSizeKb,
    undoCount: undoStack.current.length,
  };

  return <CrmContext.Provider value={value}>{children}</CrmContext.Provider>;
}
