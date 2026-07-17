"use client";

import { Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
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
import { downloadBlob } from "@/lib/crm/csv";
import { markBackupDownloaded } from "@/lib/crm/backup-meta";

function CrmShellInner() {
  const {
    ready,
    error,
    currentView,
    candidates,
    history,
    settings,
    toast,
    setImportModalOpen,
    sidebarCollapsed,
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
        setSmartOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const handleExport = () => {
    const data = {
      version: "3.0",
      exportedAt: new Date().toISOString(),
      candidates,
      history,
      settings,
    };
    downloadBlob(
      JSON.stringify(data, null, 2),
      "careerus_crm_backup_" + new Date().toISOString().slice(0, 10) + ".json",
      "application/json"
    );
    markBackupDownloaded();
    toast("Backup downloaded", "success");
  };

  const openWhatsApp = (id: number | number[], template?: string) => {
    const ids = (Array.isArray(id) ? id : [id]).filter((n) => Number.isFinite(n));
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

  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="text-center">
          <div className="mb-3 text-2xl">⏳</div>
          <div className="text-lg font-semibold text-primary">
            Loading CareerUS CRM...
          </div>
          <div className="mt-1 flex items-center justify-center gap-3 text-sm text-muted">
            Collecting Data <Loader2 className="h-4 w-4 animate-spin" />
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-6">
        <div className="max-w-md rounded-[var(--radius)] border border-danger/30 bg-card p-6 text-center shadow-sm">
          <div className="mb-2 text-2xl">⚠️</div>
          <div className="text-lg font-semibold text-danger">
            Failed to load CRM
          </div>
          <p className="mt-2 text-sm text-muted">{error}</p>
          <p className="mt-3 text-xs text-muted">
            Check that <code className="text-primary">MONGODB_URI</code> is set
            in <code className="text-primary">.env.local</code> and MongoDB is
            reachable.
          </p>
        </div>
      </div>
    );
  }

  const viewContent = {
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
  }[currentView];

  return (
    <div className="relative flex h-screen overflow-hidden bg-background">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar
          onExport={handleExport}
          onImport={() => setImportModalOpen(true)}
          onSmartAssist={() => setSmartOpen(true)}
        />
        <main className="flex-1 overflow-auto overscroll-y-contain p-3 pb-[4.5rem] sm:p-4 sm:pb-6 md:p-6">
          {viewContent}
        </main>
      </div>
      <SaveIndicator />
      <ToastContainer />
      <CandidateModal />
      <ImportModal />
      <SmartAssistModal open={smartOpen} onClose={() => setSmartOpen(false)} />
      <WhatsAppModal
        open={waOpen}
        candidateId={waQueue[waIndex] ?? null}
        queueIndex={waIndex}
        queueTotal={waQueue.length}
        defaultTemplate={waTemplate}
        onClose={closeWhatsApp}
        onNext={advanceWhatsApp}
      />
    </div>
  );
}

/** Shell UI only — CrmProvider lives in the (crm) layout so routes do not remount state. */
export function CrmShell() {
  return <CrmShellInner />;
}
