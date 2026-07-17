"use client";

import { useCrm } from "../CrmProvider";
import { ChartCard } from "../shared";
import { downloadBlob } from "@/lib/crm/csv";
import { markBackupDownloaded } from "@/lib/crm/backup-meta";

export function Backup() {
  const {
    candidates,
    history,
    settings,
    updateSettings,
    resetAll,
    setImportModalOpen,
    toast,
    dbSizeKb,
    undoCount,
  } = useCrm();

  const downloadBackup = () => {
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

  return (
    <div className="backup-layout">
      <div className="backup-panel">
        <div className="backup-panel-title">Backup & Restore</div>
        <p className="backup-panel-desc">
          Data auto-saves to MongoDB. Download JSON backups and keep them safe.
        </p>
        <div className="backup-actions">
          <button
            type="button"
            className="btn btn-primary"
            onClick={downloadBackup}
          >
            📥 Download Backup JSON
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => setImportModalOpen(true)}
          >
            📂 Restore From Backup
          </button>
          <button type="button" className="btn btn-danger" onClick={resetAll}>
            ⚠️ Reset All Data
          </button>
        </div>
      </div>

      <ChartCard title="Data Statistics" subtitle="Live database snapshot">
        <div className="backup-stats">
          <div>
            <div className="backup-stat-label">Candidates</div>
            <div className="backup-stat-value">{candidates.length}</div>
          </div>
          <div>
            <div className="backup-stat-label">Payment Records</div>
            <div className="backup-stat-value">{history.length}</div>
          </div>
          <div>
            <div className="backup-stat-label">Undo History</div>
            <div className="backup-stat-value">{undoCount}</div>
          </div>
          <div>
            <div className="backup-stat-label">Database Size</div>
            <div className="backup-stat-value">{dbSizeKb} KB</div>
          </div>
        </div>
      </ChartCard>

      <ChartCard
        title="WhatsApp Template Customization"
        subtitle="Variables: [Name], [Amount], [Date], [Remaining], [DiscountedAmount], [Original], [AssignedTo] · Edits auto-save"
      >
        {Object.entries(settings.whatsappTemplates).map(([k, v]) => (
          <div key={k} className="mb-3 grid gap-2 md:grid-cols-[220px_1fr]">
            <strong className="text-sm">{k}</strong>
            <textarea
              className="target-input remarks min-h-[76px] w-full resize-y p-2"
              value={v}
              onChange={(e) =>
                updateSettings({
                  whatsappTemplates: {
                    ...settings.whatsappTemplates,
                    [k]: e.target.value,
                  },
                })
              }
            />
          </div>
        ))}

        <div className="mt-5 backup-panel-title">Workflow Activity</div>
        <div className="muted">
          {(settings.workflowLog || []).length} automated actions logged · Last
          run{" "}
          {settings.workflowLastRun
            ? new Date(settings.workflowLastRun).toLocaleString()
            : "Never"}
        </div>
      </ChartCard>
    </div>
  );
}
