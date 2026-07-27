"use client";

import { useEffect, useState } from "react";
import { useAuth } from "./AuthProvider";
import { useCrm } from "./CrmProvider";
import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";
import { SaveIndicator } from "./SaveIndicator";
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
import { ViewDataSkeleton } from "./Skeleton";
import { downloadBlob } from "@/lib/crm/csv";
import { markBackupDownloaded } from "@/lib/crm/backup-meta";
import { createCrmWorkbook, EXCEL_MIME } from "@/lib/crm/excel";

function CrmShellInner() {
  const { canView, isAdmin } = useAuth();
  const {
    ready,
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
      }[currentView]
    : null;

  return (
    <div className="relative flex h-screen overflow-hidden bg-background">
      <Sidebar />
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
        <main className="flex-1 overflow-auto overscroll-y-contain p-3 pb-[4.5rem] sm:p-4 sm:pb-6 md:p-6">
          {error ? (
            <div className="mx-auto max-w-md rounded-[var(--radius)] border border-danger/30 bg-card p-6 text-center shadow-sm">
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
                className="mt-4 inline-flex h-9 items-center justify-center rounded-[var(--radius)] bg-primary px-4 text-sm font-semibold text-primary-foreground"
                onClick={() => window.location.reload()}
              >
                Retry
              </button>
            </div>
          ) : !ready ? (
            <ViewDataSkeleton view={currentView} />
          ) : (
            viewContent
          )}
        </main>
      </div>
      <SaveIndicator />
      <ToastContainer />
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
  );
}

/** Shell UI only — CrmProvider lives in the (crm) layout so routes do not remount state. */
export function CrmShell() {
  return <CrmShellInner />;
}
