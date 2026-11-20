"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "./AuthProvider";
import { useCrm } from "./CrmProvider";
import { Sidebar, NAV } from "./Sidebar";
import { TopBar } from "./TopBar";
import { TasksProvider, TaskMarquee } from "./TaskCenter";
import { WallpaperGuard } from "./WallpaperGuard";
import { LoadingBar } from "./DataStates";
import { SaveIndicator } from "./SaveIndicator";
import { TableColumnManager } from "./ColumnVisibility";
import { ToastContainer } from "./Toast";
import { CandidateModal } from "./modals/CandidateModal";
import { ImportModal } from "./modals/ImportModal";
import { SmartAssistModal } from "./modals/SmartAssistModal";
import { WhatsAppModal } from "./modals/WhatsAppModal";
import { Dashboard } from "./views/Dashboard";
import { DailyFollowUp } from "./views/DailyFollowUp";
import { MasterSheet } from "./master/MasterSheet";
import { Compliance } from "./views/Compliance";
import { PaymentTarget } from "./views/PaymentTarget";
import { Incentive } from "./views/Incentive";
import { History } from "./views/History";
import { Reports } from "./views/Reports";
import { Workflows } from "./views/Workflows";
import { Backup } from "./views/Backup";
import { AdminUsers } from "./views/AdminUsers";
import { SettingsPage } from "./views/Settings";
import { ViewDataSkeleton } from "./Skeleton";
import { downloadBlob } from "@/lib/crm/csv";
import { markBackupDownloaded } from "@/lib/crm/backup-meta";
import { createCrmWorkbook, EXCEL_MIME } from "@/lib/crm/excel";

function CrmShellInner() {
  const { canView, isAdmin } = useAuth();
  const {
    ready,
    refreshing,
    error,
    currentView,
    candidates,
    history,
    settings,
    toast,
    setImportModalOpen,
    navigate,
  } = useCrm();

  const [smartOpen, setSmartOpen] = useState(false);
  const [waOpen, setWaOpen] = useState(false);
  const [waQueue, setWaQueue] = useState<number[]>([]);
  const [waIndex, setWaIndex] = useState(0);
  const [waTemplate, setWaTemplate] = useState<string | undefined>();
  // Cmd/Alt+Tab-style page switcher: holding Ctrl (Cmd on Mac) alone opens
  // a dock of page icons after a short beat (so a quick Ctrl+K/Ctrl+S/Ctrl+Z
  // tap never flashes it); tapping Left/Right while held moves a highlight
  // across it; releasing Ctrl commits whichever icon is highlighted and
  // navigates there. `status` drives the CSS animation - "open" while
  // held, "closing" for the brief exit animation before it unmounts.
  const [switcher, setSwitcher] = useState<
    { status: "open" | "closing"; index: number } | null
  >(null);
  const ctrlHeldRef = useRef(false);
  const peekTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Pages this account is actually allowed to see (admin-controlled feature
  // access), in the same order as the sidebar — the switcher cycles through
  // exactly this list so keyboard nav never lands somewhere the sidebar
  // itself wouldn't offer.
  const navItems = useMemo(
    () => NAV.filter((item) => canView(item.view)),
    [canView]
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing =
        e.target instanceof HTMLElement &&
        e.target.matches("input,textarea,select,[contenteditable='true']");
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k" && !typing) {
        e.preventDefault();
        if (!ready) return;
        setSmartOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [ready]);

  useEffect(() => {
    const clearPeekTimer = () => {
      if (peekTimerRef.current) {
        clearTimeout(peekTimerRef.current);
        peekTimerRef.current = null;
      }
    };
    const isTypingTarget = (target: EventTarget | null) =>
      target instanceof HTMLElement &&
      target.matches("input,textarea,select,[contenteditable='true']");

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Control" || e.key === "Meta") {
        if (ctrlHeldRef.current) return; // held/repeating, already handled
        ctrlHeldRef.current = true;
        if (isTypingTarget(e.target) || !ready || navItems.length < 2) return;
        clearPeekTimer();
        peekTimerRef.current = setTimeout(() => {
          setSwitcher((prev) => {
            if (prev) return prev;
            const idx = navItems.findIndex((item) => item.view === currentView);
            return { status: "open", index: idx < 0 ? 0 : idx };
          });
        }, 130);
        return;
      }

      if ((e.ctrlKey || e.metaKey) && (e.key === "ArrowLeft" || e.key === "ArrowRight")) {
        if (isTypingTarget(e.target) || !ready || navItems.length < 2) return;
        e.preventDefault();
        clearPeekTimer();
        const delta = e.key === "ArrowRight" ? 1 : -1;
        setSwitcher((prev) => {
          if (prev?.status === "closing") return prev;
          const base = prev ? prev.index : navItems.findIndex((item) => item.view === currentView);
          const from = base < 0 ? 0 : base;
          return { status: "open", index: (from + delta + navItems.length) % navItems.length };
        });
        return;
      }

      // Any other key held together with Ctrl/Cmd (K, S, Z, Y, C, V, ...)
      // means this isn't a page-switch gesture - cancel the pending peek.
      if (e.ctrlKey || e.metaKey) clearPeekTimer();
    };

    // Reads `switcher` directly (rather than via a setState updater) so the
    // navigate() side effect runs in the event handler itself, never inside
    // a state updater function - React may invoke updaters more than once,
    // which would call navigate (and its own setState calls) during another
    // component's render and trigger "Cannot update a component while
    // rendering a different component".
    const commitAndClose = (shouldNavigate: boolean) => {
      clearPeekTimer();
      ctrlHeldRef.current = false;
      if (shouldNavigate && switcher && switcher.status === "open") {
        const target = navItems[switcher.index];
        if (target && target.view !== currentView) navigate(target.view);
      }
      setSwitcher((prev) => (prev && prev.status === "open" ? { ...prev, status: "closing" } : prev));
    };

    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === "Control" || e.key === "Meta") commitAndClose(true);
    };
    const onBlur = () => commitAndClose(false);

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
      clearPeekTimer();
    };
  }, [ready, navItems, currentView, navigate, switcher]);

  useEffect(() => {
    if (switcher?.status !== "closing") return;
    const t = setTimeout(() => setSwitcher(null), 170);
    return () => clearTimeout(t);
  }, [switcher]);

  useEffect(() => {
    if (!ready) return;
    if (!canView(currentView) && currentView !== "dashboard") {
      navigate("dashboard");
    }
    // Intentionally omit navigate — stable enough; avoid re-running on identity churn.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, canView, currentView]);

  const handleExport = async () => {
    if (!ready) {
      toast("Still loading data — try export in a moment", "info");
      return;
    }
    try {
      const blob = await createCrmWorkbook({
        version: "3.0",
        exportedAt: new Date().toISOString(),
        candidates,
        history,
        settings,
      });
      downloadBlob(
        blob,
        "careerus_crm_backup_" + new Date().toISOString().slice(0, 10) + ".xlsx",
        EXCEL_MIME
      );
      markBackupDownloaded();
      toast("Excel backup downloaded", "success");
    } catch (err) {
      console.error("Excel backup failed:", err);
      toast("Could not create Excel backup", "error");
    }
  };

  const openWhatsApp = (id: number | number[], template?: string) => {
    const ids = (Array.isArray(id) ? id : [id]).filter((n) =>
      Number.isFinite(n)
    );
    if (!ids.length) return;
    setWaQueue(ids);
    setWaIndex(0);
    setWaTemplate(template);
    setWaOpen(true);
  };

  const closeWhatsApp = () => {
    setWaOpen(false);
    setWaQueue([]);
    setWaIndex(0);
  };

  const advanceWhatsApp = () => {
    if (waIndex + 1 < waQueue.length) {
      setWaIndex((i) => i + 1);
    } else {
      closeWhatsApp();
    }
  };

  const viewContent = canView(currentView)
    ? {
        dashboard: <Dashboard />,
        daily: <DailyFollowUp onWhatsApp={openWhatsApp} />,
        master: <MasterSheet />,
        compliance: <Compliance />,
        target: <PaymentTarget />,
        incentive: <Incentive />,
        history: <History />,
        reports: <Reports />,
        workflows: <Workflows />,
        backup: <Backup />,
        admin: isAdmin ? <AdminUsers /> : null,
        settings: <SettingsPage />,
      }[currentView]
    : null;

  return (
    <TasksProvider>
    <div className="relative flex h-dvh overflow-hidden bg-background">
      <WallpaperGuard />
      <LoadingBar active={refreshing} label="Refreshing data" />
      <Sidebar />
      {ready && <TableColumnManager view={currentView} />}
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar
          onExport={handleExport}
          onImport={() => {
            if (!ready) {
              toast("Still loading data — try import in a moment", "info");
              return;
            }
            setImportModalOpen(true);
          }}
          onSmartAssist={() => {
            if (!ready) {
              toast("Still loading data — try Smart Assist in a moment", "info");
              return;
            }
            setSmartOpen(true);
          }}
        />
        <TaskMarquee />
        <main className="flex-1 overflow-auto overscroll-y-contain p-3 pb-18 sm:p-4 sm:pb-6 md:p-6">
          {error ? (
            <div className="mx-auto max-w-md rounded-(--radius) border border-danger/30 bg-card p-6 text-center shadow-sm">
              <div className="mb-2 text-2xl">⚠️</div>
              <div className="text-lg font-semibold text-danger">
                Failed to load CRM data
              </div>
              <p className="mt-2 text-sm text-muted">{error}</p>
              <p className="mt-3 text-xs text-muted">
                Check that MongoDB is reachable, then refresh the page.
              </p>
              <button
                type="button"
                className="mt-4 inline-flex h-9 items-center justify-center rounded-(--radius) bg-primary px-4 text-sm font-semibold text-primary-foreground"
                onClick={() => window.location.reload()}
              >
                Retry
              </button>
            </div>
          ) : !ready ? (
            <ViewDataSkeleton view={currentView} />
          ) : (
            <div key={currentView} className="crm-view-transition">
              {viewContent}
            </div>
          )}
        </main>
      </div>
      <SaveIndicator />
      <ToastContainer />
      {switcher && (
        <div className="pointer-events-none fixed inset-x-0 bottom-6 z-6000 flex justify-center px-3">
          <div
            className={`crm-switcher-dock crm-switcher-track flex max-w-[95vw] items-end gap-1 overflow-x-auto px-2.5 pb-2 pt-3 ${
              switcher.status === "closing" ? "crm-switcher-closing" : ""
            }`}
          >
            {navItems.map((item, i) => {
              const selected = i === switcher.index;
              const isCurrent = item.view === currentView;
              const dist = Math.min(Math.abs(i - switcher.index), 3);
              return (
                <div
                  key={item.view}
                  data-dist={dist}
                  data-selected={selected ? "true" : undefined}
                  style={{ "--i": i } as React.CSSProperties}
                  className="crm-switcher-item flex shrink-0 flex-col items-center px-0.5"
                >
                  <span className="crm-switcher-label">{item.label}</span>
                  <div className="crm-switcher-icon flex items-center justify-center rounded-[14px]">
                    {item.icon}
                  </div>
                  <span
                    className={`crm-switcher-dot ${isCurrent ? "is-current" : ""}`}
                  />
                </div>
              );
            })}
          </div>
        </div>
      )}
      {ready && (
        <>
          <CandidateModal />
          <ImportModal />
          <SmartAssistModal
            open={smartOpen}
            onClose={() => setSmartOpen(false)}
          />
          <WhatsAppModal
            open={waOpen}
            candidateId={waQueue[waIndex] ?? null}
            queueIndex={waIndex}
            queueTotal={waQueue.length}
            defaultTemplate={waTemplate}
            onClose={closeWhatsApp}
            onNext={advanceWhatsApp}
          />
        </>
      )}
    </div>
    </TasksProvider>
  );
}

/** Shell UI only — CrmProvider lives in the (crm) layout so routes do not remount state. */
export function CrmShell() {
  return <CrmShellInner />;
}
