"use client";

import { useEffect, useState } from "react";
import { useCrm } from "../CrmProvider";
import {
  money,
  getRemaining,
  getComplianceStatus,
  getTotalPaid,
} from "@/lib/crm";

export function SmartAssistModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const {
    candidates,
    setSmartFilter,
    setActiveFilters,
    navigate,
    toast,
  } = useCrm();
  const [query, setQuery] = useState("");
  const [result, setResult] = useState("");

  const active = candidates.filter(
    (c) => c.status === "Active" && getRemaining(c) > 0
  ).length;
  const outstanding = candidates.reduce((s, c) => s + getRemaining(c), 0);
  const overdue = candidates.filter(
    (c) => getComplianceStatus(c) === "Overdue"
  ).length;
  const quality = candidates.filter(
    (c) => !c.phoneNumber || !c.name || !c.totalServiceFee
  ).length;

  const summaryHtml = () => {
    const totalFee = candidates.reduce((s, c) => s + c.totalServiceFee, 0);
    const paid = candidates.reduce((s, c) => s + getTotalPaid(c), 0);
    const pct = totalFee ? Math.round((paid / totalFee) * 100) : 0;
    return `<h3 class="text-base font-bold mb-2">Collection Executive Summary</h3>
      <p class="text-sm text-muted">${candidates.length} candidates · ${active} active collectable · ${overdue} overdue · ${pct}% collected overall.</p>
      <p class="text-sm mt-2">Outstanding balance: <strong>${money(outstanding)}</strong></p>`;
  };

  const applyFilter = (type: string, amount?: number) => {
    setSmartFilter({ type, amount });
    navigate("master");
    onClose();
    toast("Smart filter applied to Master Sheet", "success");
  };

  const runCommand = (q: string) => {
    const lower = q.toLowerCase().trim();
    if (!lower) {
      setResult(summaryHtml());
      return;
    }
    if (/summary|overview|status/.test(lower)) {
      setResult(summaryHtml());
      return;
    }
    if (/overdue/.test(lower)) {
      applyFilter("overdue");
      return;
    }
    if (/missing phone|no phone/.test(lower)) {
      applyFilter("missingPhone");
      return;
    }
    if (/duplicate/.test(lower)) {
      applyFilter("duplicates");
      return;
    }
    if (/focus|priority|follow.?up|who should/.test(lower)) {
      applyFilter("focus");
      return;
    }
    if (/missing data|data quality|incomplete/.test(lower)) {
      applyFilter("missingData");
      return;
    }
    const amountMatch = lower.match(
      /(?:above|over|more than|greater than)\s*\$?([\d,]+)/
    );
    if (amountMatch) {
      applyFilter(
        "highBalance",
        Number(amountMatch[1].replace(/,/g, "")) || 5000
      );
      return;
    }
    if (/yatin/.test(lower)) {
      setActiveFilters({ assignedTo: "Yatin" });
      navigate("master");
      onClose();
      return;
    }
    if (/jayraj/.test(lower)) {
      setActiveFilters({ assignedTo: "Jayraj" });
      navigate("master");
      onClose();
      return;
    }
    setResult(
      `<h3 class="text-base font-bold mb-2">Command not recognized yet</h3>
      <p class="text-sm text-muted">Try: "show overdue candidates", "missing phone numbers", "top follow-up priorities", "remaining above $5,000", "duplicate candidates", or "give me a collection summary".</p>`
    );
  };

  useEffect(() => {
    if (open) {
      setResult(summaryHtml());
      setTimeout(() => document.getElementById("smartAssistInput")?.focus(), 80);
    }
  }, [open]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        if (open) onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[4200] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-[760px] rounded-[24px] border border-border bg-card shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal
        aria-label="CareerUS Smart Assist"
      >
        <div className="flex items-start justify-between gap-3 border-b border-border px-6 py-5">
          <div>
            <div className="text-xl font-bold">✨ CareerUS Smart Assist</div>
            <div className="text-xs text-muted">Offline Smart Engine active</div>
          </div>
          <button type="button" className="text-2xl text-muted" onClick={onClose}>
            ×
          </button>
        </div>

        <div className="grid grid-cols-2 gap-3 p-6 md:grid-cols-4">
          {[
            ["Active Collectable", active],
            ["Outstanding", money(outstanding)],
            ["Overdue", overdue],
            ["Data Issues", quality],
          ].map(([label, value]) => (
            <div
              key={String(label)}
              className="rounded-xl border border-border bg-secondary p-3"
            >
              <div className="text-[10px] font-black uppercase tracking-wide text-muted">
                {label}
              </div>
              <div className="mt-1 text-lg font-bold">{value}</div>
            </div>
          ))}
        </div>

        <div className="flex gap-2 px-6 pb-3">
          <input
            id="smartAssistInput"
            className="flex-1 rounded-[var(--radius)] border border-border bg-input px-4 py-2.5 text-sm outline-none focus:border-primary"
            placeholder="Ask: Who should I follow up with first?"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") runCommand(query);
            }}
          />
          <button
            type="button"
            className="rounded-[var(--radius)] bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
            onClick={() => runCommand(query)}
          >
            Run
          </button>
        </div>

        <div className="flex flex-wrap gap-2 px-6 pb-4">
          {[
            ["summary", "Executive summary"],
            ["focus", "Focus queue"],
            ["overdue", "Overdue"],
            ["missingPhone", "Missing phone"],
            ["duplicates", "Duplicates"],
            ["missingData", "Data scan"],
          ].map(([action, label]) => (
            <button
              key={action}
              type="button"
              className="rounded-full border border-border bg-secondary px-3 py-1.5 text-xs font-medium"
              onClick={() => {
                if (action === "summary") setResult(summaryHtml());
                else applyFilter(action);
              }}
            >
              {label}
            </button>
          ))}
          <button
            type="button"
            className="rounded-full border border-border bg-secondary px-3 py-1.5 text-xs font-medium"
            onClick={() => {
              setSmartFilter(null);
              toast("Smart filter cleared", "info");
            }}
          >
            Clear smart filter
          </button>
        </div>

        <div
          className="mx-6 mb-6 rounded-[var(--radius)] border border-border bg-secondary p-4 text-sm"
          dangerouslySetInnerHTML={{ __html: result }}
        />
      </div>
    </div>
  );
}
