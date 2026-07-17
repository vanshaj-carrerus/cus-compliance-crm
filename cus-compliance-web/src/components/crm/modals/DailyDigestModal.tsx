"use client";

import { useCrm } from "../CrmProvider";
import {
  money,
  getRemaining,
  getComplianceStatus,
  todayIso,
  statusExcluded,
  addDays,
  priorityStats,
} from "@/lib/crm";

export function DailyDigestModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { candidates, history, updateSettings, navigate } = useCrm();

  if (!open) return null;

  const t = todayIso();
  const weekStart = addDays(t, -6);
  const prevStart = addDays(t, -13);
  const prevEnd = addDays(t, -7);

  const followToday = candidates.filter(
    (c) => c.nextFollowUpDate === t && !statusExcluded(c.status)
  ).length;
  const overdue = priorityStats(candidates, "overdue").count;
  const newThisWeek = candidates.filter(
    (c) => String(c.createdAt || "").slice(0, 10) >= weekStart
  ).length;

  const paymentHist = history.filter((h) => h.type === "Payment" || !h.type);
  const sumBetween = (from: string, to: string) =>
    paymentHist
      .filter((h) => {
        const d = String(h.date || h.timestamp || "").slice(0, 10);
        return d >= from && d <= to;
      })
      .reduce((s, h) => s + (Number(h.amount) || 0), 0);

  const thisWeek = sumBetween(weekStart, t);
  const lastWeek = sumBetween(prevStart, prevEnd);
  const delta = thisWeek - lastWeek;
  const outstanding = candidates.reduce((s, c) => s + getRemaining(c), 0);
  const overdueCompliance = candidates.filter(
    (c) => getComplianceStatus(c) === "Overdue"
  ).length;

  const markRead = () => {
    updateSettings({ lastDigestRead: t });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[4300] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div className="w-full max-w-lg overflow-hidden rounded-[24px] border border-border bg-card shadow-2xl">
        <div className="flex items-start justify-between gap-3 border-b border-border px-6 py-5">
          <div>
            <div className="text-xl font-bold">☀️ Daily CRM Digest</div>
            <div className="mt-1 text-xs text-muted">
              Your collection and follow-up snapshot
            </div>
          </div>
          <button
            type="button"
            className="text-2xl text-muted"
            onClick={onClose}
            aria-label="Close digest"
          >
            ×
          </button>
        </div>

        <div className="space-y-4 p-6">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              { label: "Today Follow-ups", value: String(followToday) },
              { label: "Overdue Payments", value: String(overdue) },
              { label: "New This Week", value: String(newThisWeek) },
              { label: "This Week Collection", value: money(thisWeek) },
            ].map((card) => (
              <div
                key={card.label}
                className="rounded-[14px] border border-border bg-secondary p-3"
              >
                <div className="text-[10px] font-black uppercase tracking-wide text-muted">
                  {card.label}
                </div>
                <div className="mt-1 text-xl font-bold text-primary">
                  {card.value}
                </div>
              </div>
            ))}
          </div>

          <div className="rounded-[var(--radius)] border border-border bg-secondary p-4">
            <div className="text-sm font-semibold">Collection Comparison</div>
            <p className="mt-2 text-sm text-muted">
              This week:{" "}
              <strong className="text-success">{money(thisWeek)}</strong>
              {" · "}Previous week: <strong>{money(lastWeek)}</strong>
              {" · "}Change:{" "}
              <strong className={delta >= 0 ? "text-success" : "text-danger"}>
                {money(delta)}
              </strong>
            </p>
            <p className="mt-2 text-sm text-muted">
              Outstanding: <strong>{money(outstanding)}</strong>
              {" · "}Compliance overdue: <strong>{overdueCompliance}</strong>
            </p>
          </div>
        </div>

        <div className="flex flex-wrap justify-end gap-2 border-t border-border px-6 py-4">
          <button
            type="button"
            className="rounded border border-border bg-secondary px-4 py-2 text-sm"
            onClick={() => {
              navigate("daily");
              onClose();
            }}
          >
            Open Daily Follow-up
          </button>
          <button
            type="button"
            className="rounded bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
            onClick={markRead}
          >
            Mark as Read
          </button>
        </div>
      </div>
    </div>
  );
}
