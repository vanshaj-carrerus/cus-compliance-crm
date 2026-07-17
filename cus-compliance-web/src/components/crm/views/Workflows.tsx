"use client";

import { useCrm } from "../CrmProvider";
import {
  CrmTable,
  DataTableContainer,
  EmptyTableRow,
  PaginationBar,
  usePagination,
} from "../shared";
import { downloadBlob } from "@/lib/crm/csv";

const RULE_INFO = {
  autoOverdue: {
    name: "Auto Overdue Reminder",
    desc: "When an unpaid installment is 3+ days overdue, append a follow-up remark and set next follow-up to today.",
  },
  autoNoResponse: {
    name: "Auto No Response",
    desc: "When an active candidate has no payment for 60 days, change status to No Response and add an inactivity remark.",
  },
  autoFullyPaid: {
    name: "Auto Fully Paid",
    desc: "When remaining balance reaches zero while status is Active, change status to Fully Paid and add a completion remark.",
  },
  followUpReminder: {
    name: "Follow-up Reminder",
    desc: "When next follow-up is today, surface the candidate in Daily Follow-up and browser notifications.",
  },
} as const;

export function Workflows() {
  const { settings, updateSettings, runWorkflows, toast } = useCrm();
  const rules = settings.workflowRules;
  const log = [...(settings.workflowLog || [])].reverse();
  const { page, pageSize, pageCount, pageItems, setPage, setPageSize } =
    usePagination(log, 50);

  const requestNotifications = async () => {
    if (!("Notification" in window)) {
      toast("Notifications not supported in this browser", "info");
      return;
    }
    const perm = await Notification.requestPermission();
    toast(
      perm === "granted"
        ? "Notifications enabled"
        : "Notifications not granted",
      perm === "granted" ? "success" : "info"
    );
  };

  return (
    <div>
      <div className="workflow-header">
        <div>
          <div className="table-title">Automated Workflows</div>
          <div className="table-subtitle">
            Runs every 15 minutes while the CRM is open. All actions are logged
            and saved to MongoDB.
          </div>
        </div>
        <div className="table-actions">
          <button
            type="button"
            className="btn btn-secondary"
            onClick={requestNotifications}
          >
            Enable Notifications
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => runWorkflows(true)}
          >
            ▶ Run Now
          </button>
        </div>
      </div>

      <div className="workflow-grid">
        {(
          Object.entries(RULE_INFO) as [
            keyof typeof RULE_INFO,
            (typeof RULE_INFO)[keyof typeof RULE_INFO],
          ][]
        ).map(([key, rule]) => (
          <div key={key} className="workflow-rule-card">
            <div className="workflow-rule-head">
              <div className="font-bold">{rule.name}</div>
              <label className="workflow-toggle">
                <input
                  type="checkbox"
                  checked={rules[key]}
                  onChange={(e) =>
                    updateSettings({
                      workflowRules: { ...rules, [key]: e.target.checked },
                    })
                  }
                />
                <span className="workflow-toggle-track" />
                <span className="workflow-toggle-thumb" />
              </label>
            </div>
            <p className="mt-2 text-xs leading-relaxed muted">{rule.desc}</p>
          </div>
        ))}
      </div>

      <DataTableContainer
        title="Workflow Log"
        subtitle={`Last run: ${
          settings.workflowLastRun
            ? new Date(settings.workflowLastRun).toLocaleString()
            : "Never"
        }`}
        actions={
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() =>
              downloadBlob(
                JSON.stringify(settings.workflowLog || [], null, 2),
                "careerus_workflow_log_" +
                  new Date().toISOString().slice(0, 10) +
                  ".json",
                "application/json"
              )
            }
          >
            Export Log
          </button>
        }
        toolbar={
          <PaginationBar
            total={log.length}
            page={page}
            pageSize={pageSize}
            pageCount={pageCount}
            onPageChange={setPage}
            onPageSizeChange={setPageSize}
          />
        }
      >
        <CrmTable minWidth="720px">
          <thead>
            <tr>
              <th>Time</th>
              <th>Rule</th>
              <th>Candidate</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {pageItems.length ? (
              pageItems.map((x, i) => (
                <tr key={`${x.id}-${x.timestamp}-${i}`}>
                  <td className="muted">
                    {new Date(x.timestamp).toLocaleString()}
                  </td>
                  <td>{x.rule}</td>
                  <td>{x.candidateName || "-"}</td>
                  <td>{x.action}</td>
                </tr>
              ))
            ) : (
              <EmptyTableRow colSpan={4} message="No workflow actions yet." />
            )}
          </tbody>
        </CrmTable>
      </DataTableContainer>
    </div>
  );
}
