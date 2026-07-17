import type { Candidate, CrmSettings, WorkflowLogEntry } from "./types";
import { getRemaining, getLastPaymentDate, statusExcluded } from "./calc";
import { todayIso, addDays, diffDays } from "./dates";
import { newId } from "./normalize";

function appendRemark(c: Candidate, text: string) {
  const t = String(text || "").trim();
  if (!t) return;
  if (!String(c.remarks || "").includes(t)) {
    c.remarks =
      (String(c.remarks || "").trim()
        ? String(c.remarks).trim() + " | "
        : "") + t;
  }
}

export function runWorkflows(
  candidates: Candidate[],
  settings: CrmSettings,
  manual = false
): {
  candidates: Candidate[];
  settings: CrmSettings;
  changed: number;
  overdueNotify: number;
  followNotify: number;
  manual: boolean;
} {
  const rules = settings.workflowRules;
  const t = todayIso();
  let changed = 0;
  let overdueNotify = 0;
  let followNotify = 0;
  const state = { ...(settings.workflowState || {}) };
  const log: WorkflowLogEntry[] = [...(settings.workflowLog || [])];

  const logWorkflow = (rule: string, c: Candidate, action: string) => {
    log.push({
      id: newId(),
      timestamp: new Date().toISOString(),
      rule,
      candidateId: c?.id || "",
      candidateName: c?.name || "",
      action,
    });
    if (log.length > 2000) log.splice(0, log.length - 2000);
  };

  const next = candidates.map((orig) => {
    const c = { ...orig, installments: orig.installments.map((i) => ({ ...i })) };
    if (statusExcluded(c.status)) return c;

    const due3 = (c.installments || []).some(
      (i) =>
        i &&
        !i.paid &&
        i.date &&
        (Number(i.amount) || 0) > 0 &&
        diffDays(i.date, t) <= -3
    );
    if (rules.autoOverdue && due3 && state["overdue:" + c.id] !== t) {
      appendRemark(c, "Payment overdue - follow-up required");
      c.nextFollowUpDate = t;
      state["overdue:" + c.id] = t;
      logWorkflow(
        "Auto Overdue Reminder",
        c,
        "Remark added; next follow-up set to today"
      );
      changed++;
      overdueNotify++;
    }

    const last =
      getLastPaymentDate(c) ||
      String(c.createdAt || c.startDate || "").slice(0, 10);
    if (
      rules.autoNoResponse &&
      String(c.status) === "Active" &&
      last &&
      diffDays(t, last) >= 60 &&
      state["noresponse:" + c.id] !== t
    ) {
      c.status = "No Response";
      appendRemark(c, "Auto-changed to No Response due to inactivity");
      state["noresponse:" + c.id] = t;
      logWorkflow("Auto No Response", c, "Status changed to No Response");
      changed++;
    }

    if (
      rules.autoFullyPaid &&
      getRemaining(c) <= 0 &&
      String(c.status) === "Active"
    ) {
      c.status = "Fully Paid";
      appendRemark(c, "All installments completed");
      logWorkflow("Auto Fully Paid", c, "Status changed to Fully Paid");
      changed++;
    }

    if (
      rules.followUpReminder &&
      c.nextFollowUpDate === t &&
      state["followup:" + c.id] !== t
    ) {
      state["followup:" + c.id] = t;
      logWorkflow(
        "Follow-up Reminder",
        c,
        "Added to Daily Follow-up queue"
      );
      followNotify++;
      changed++;
    }

    return c;
  });

  return {
    candidates: next,
    settings: {
      ...settings,
      workflowState: state,
      workflowLog: log,
      workflowLastRun: new Date().toISOString(),
    },
    changed,
    overdueNotify,
    followNotify,
    manual,
  };
}

export function fillTemplate(
  text: string,
  data: Record<string, string>
): string {
  return String(text || "").replace(
    /\[(Name|Amount|Date|Remaining|DiscountedAmount|Original|AssignedTo)\]/g,
    (_, k) => data[k] ?? ""
  );
}

export { addDays, todayIso };
