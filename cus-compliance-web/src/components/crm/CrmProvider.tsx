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
import { getRemaining, nextUnpaid } from "@/lib/crm/calc";
import { todayIso, addDays } from "@/lib/crm/dates";
import { filterCandidates } from "@/lib/crm/incentive";
import { runWorkflows as runWorkflowsFn } from "@/lib/crm/workflows";
import {
  ensureCrmBootstrap,
  peekCrmCache,
  setCrmCache,
} from "@/lib/crm-cache";

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
  updateMasterField: (
    id: number,
    field: string,
    value: string | number | boolean
  ) => void;
  updateInstallment: (id: number, idx: number, value: string) => void;
  togglePaid: (id: number, idx: number, paid: boolean) => void;
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
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [toasts, setToasts] = useState<ToastItem[]>([]);
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
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stateRef = useRef<Snapshot>({
    candidates: [],
    history: [],
    settings: defaultSettings(),
  });

  useEffect(() => {
    stateRef.current = { candidates, history, settings };
  }, [candidates, history, settings]);

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

  const persist = useCallback(async (snap: Snapshot, silent = false) => {
    if (!silent) setSaveState("saving");
    try {
      const res = await fetch("/api/crm/save", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(snap),
      });
      if (!res.ok) throw new Error("Save failed");
      if (!silent) setSaveState("saved");
    } catch (e) {
      console.error(e);
      setSaveState("error");
      throw e;
    }
  }, []);

  const queueSave = useCallback(() => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    setSaveState("saving");
    saveTimer.current = setTimeout(() => {
      persist(stateRef.current).catch(() => {});
    }, 250);
  }, [persist]);

  const saveNow = useCallback(async () => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    await persist(stateRef.current);
    toast("Saved", "success");
  }, [persist, toast]);

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
    if (peekCrmCache()) {
      setReady(true);
      return;
    }
    (async () => {
      try {
        const data = await ensureCrmBootstrap();
        if (cancelled) return;
        setCandidatesState(data.candidates);
        setHistoryState(data.history);
        setSettingsState(data.settings);
        setReady(true);
        setSaveState("saved");
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
        saveNow();
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
  }, [undo, redo, saveNow]);

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
    setCandidateModalOpen(false);
    setImportModalOpen(false);
    setEditingId(null);
  };

  const saveCandidateForm = (data: Partial<Candidate>) => {
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

  const updateMasterField = (
    id: number,
    field: string,
    value: string | number | boolean
  ) => {
    const idx = candidates.findIndex((x) => x.id === id);
    if (idx < 0) return;
    snapshot();
    const c = { ...candidates[idx] };
    const numFields = ["annualPackage", "serviceFeePercent", "installmentCount"];
    if (numFields.includes(field)) {
      (c as Record<string, unknown>)[field] =
        Number(String(value).replace(/[$,%\s,]/g, "")) || 0;
    } else {
      (c as Record<string, unknown>)[field] = value;
    }
    if (
      field === "status" &&
      ["Run Away", "No Response"].includes(String(value))
    ) {
      c.nextFollowUpDate = addDays(todayIso(), 7);
    }
    const next = [...candidates];
    next[idx] = normalizeCandidate(c);
    setCandidates(next);
    queueSave();
  };

  const updateInstallment = (id: number, idx: number, value: string) => {
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
      if (n) normalized = { ...normalized, nextFollowUpDate: n.inst.date || normalized.nextFollowUpDate };
    }
    const next = [...candidates];
    next[ci] = normalized;
    setCandidates(next);
    queueSave();
    toast(paid ? "Payment marked paid" : "Payment marked unpaid", "success");
  };

  const markContacted = (id: number) => {
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
    const ci = candidates.findIndex((x) => String(x.id) === String(id));
    if (ci < 0) return;
    snapshot();
    const c = { ...candidates[ci], [field]: String(value || "") };
    const next = [...candidates];
    next[ci] = normalizeCandidate(c);
    setCandidates(next);
    queueSave();
  };

  const replaceAll = async (
    c: Candidate[],
    h: PaymentHistory[],
    s: CrmSettings
  ) => {
    snapshot();
    setCandidates(c);
    setHistory(h);
    setSettings(s);
    stateRef.current = { candidates: c, history: h, settings: s };
    setCrmCache({ candidates: c, history: h, settings: s });
    await persist(stateRef.current);
    toast("Backup restored", "success");
  };

  const resetAll = () => {
    if (!confirm("Delete ALL CRM data?")) return;
    if (!confirm("Final confirmation: this cannot be undone.")) return;
    snapshot();
    const emptySettings = defaultSettings();
    setCandidates([]);
    setHistory([]);
    setSettings(emptySettings);
    setCrmCache({
      candidates: [],
      history: [],
      settings: emptySettings,
    });
    queueSave();
    toast("All data reset", "info");
  };

  const runWorkflows = (manual = false) => {
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
    updateMasterField,
    updateInstallment,
    togglePaid,
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
