"use client";

import { useEffect, useState } from "react";
import { useCrm } from "../CrmProvider";
import {
  money,
  getRemaining,
  getComplianceStatus,
  getTotalPaid,
  fillTemplate,
  nextUnpaid,
  todayIso,
  fmtDate,
  cleanPhone,
  phoneOf,
} from "@/lib/crm";
import { newId } from "@/lib/crm/normalize";
import type { Candidate } from "@/lib/crm/types";

function templateData(c: Candidate, overrides: Record<string, string> = {}) {
  const due = nextUnpaid(c);
  return {
    Name: c.name || "Candidate",
    Amount:
      overrides.amount ||
      money(due ? Number(due.inst.amount) || 0 : 0),
    Date:
      overrides.date ||
      fmtDate(due ? due.inst.date : todayIso()),
    Remaining: money(getRemaining(c)),
    DiscountedAmount: overrides.discounted || money(getRemaining(c)),
    Original: money(getRemaining(c)),
    AssignedTo: c.assignedTo || "Yatin",
  };
}

export function WhatsAppModal({
  open,
  candidateId,
  defaultTemplate,
  queueIndex = 0,
  queueTotal = 1,
  onClose,
  onNext,
}: {
  open: boolean;
  candidateId: number | null;
  defaultTemplate?: string;
  queueIndex?: number;
  queueTotal?: number;
  onClose: () => void;
  onNext?: () => void;
}) {
  const {
    candidates,
    settings,
    snapshot,
    setCandidates,
    setHistory,
    history,
    queueSave,
    toast,
  } = useCrm();

  const c = candidates.find((x) => String(x.id) === String(candidateId));
  const [template, setTemplate] = useState(defaultTemplate || "Payment Reminder");
  const [text, setText] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState("");
  const [discount, setDiscount] = useState("");

  useEffect(() => {
    if (!open || !c) return;
    const tpl = defaultTemplate || "Payment Reminder";
    setTemplate(tpl);
    const due = nextUnpaid(c);
    setAmount(money(due ? Number(due.inst.amount) || 0 : 0));
    setDate(fmtDate(due ? due.inst.date : todayIso()));
    setDiscount(money(getRemaining(c)));
    setText(settings.whatsappTemplates[tpl] || "");
  }, [open, c, defaultTemplate, settings.whatsappTemplates]);

  if (!open || !c) return null;

  const preview = fillTemplate(
    text,
    templateData(c, { amount, date, discounted: discount })
  );

  const logMessage = () => {
    snapshot();
    const ts = new Date().toISOString();
    const updated = candidates.map((x) => {
      if (String(x.id) !== String(c.id)) return x;
      return {
        ...x,
        messageLog: [
          ...(x.messageLog || []),
          { id: newId(), template, timestamp: ts, message: preview },
        ],
        lastContactDate: todayIso(),
        contactMethod: "WhatsApp" as const,
      };
    });
    setCandidates(updated);
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
        type: "WhatsApp",
        notes: template,
        message: preview,
        template,
        timestamp: ts,
      },
    ]);
    queueSave();
    toast("WhatsApp message logged", "success");
  };

  const openWhatsApp = () => {
    const p = cleanPhone(phoneOf(c));
    if (!p) {
      toast("Phone number missing", "error");
      return;
    }
    window.open(
      `https://wa.me/${p}?text=${encodeURIComponent(preview)}`,
      "_blank",
      "noopener"
    );
  };

  return (
    <div className="fixed inset-0 z-[4200] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div className="max-h-[92vh] w-full max-w-[820px] overflow-auto rounded-[26px] border border-border bg-card shadow-2xl">
        <div className="flex items-start justify-between gap-3 border-b border-border px-6 py-5">
          <div>
            <div className="text-xl font-bold">💬 WhatsApp Message</div>
            <div className="mt-1 text-xs text-muted">
              {c.name || "Unnamed"} · {phoneOf(c) || "No phone"}
              {queueTotal > 1 && (
                <span className="ml-2 font-semibold text-primary">
                  · {queueIndex + 1} of {queueTotal}
                </span>
              )}
            </div>
          </div>
          <button
            type="button"
            className="text-2xl text-muted"
            onClick={onClose}
          >
            ×
          </button>
        </div>
        <div className="grid grid-cols-1 gap-3 p-6 md:grid-cols-2">
          <label className="flex flex-col gap-1 text-xs text-muted">
            Template
            <select
              className="rounded border border-border bg-input px-3 py-2 text-sm"
              value={template}
              onChange={(e) => {
                setTemplate(e.target.value);
                setText(settings.whatsappTemplates[e.target.value] || "");
              }}
            >
              {Object.keys(settings.whatsappTemplates).map((k) => (
                <option key={k}>{k}</option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted">
            Amount
            <input
              className="rounded border border-border bg-input px-3 py-2 text-sm"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted">
            Date
            <input
              className="rounded border border-border bg-input px-3 py-2 text-sm"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted">
            Discounted Amount
            <input
              className="rounded border border-border bg-input px-3 py-2 text-sm"
              value={discount}
              onChange={(e) => setDiscount(e.target.value)}
            />
          </label>
          <label className="col-span-full flex flex-col gap-1 text-xs text-muted">
            Custom / Template Text
            <textarea
              className="min-h-[100px] rounded border border-border bg-input px-3 py-2 text-sm"
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
          </label>
          <div className="col-span-full">
            <div className="mb-1 text-xs font-bold uppercase tracking-wide text-muted">
              Live Preview
            </div>
            <div className="min-h-[120px] whitespace-pre-wrap rounded-[15px] border border-border bg-secondary p-4 text-sm leading-relaxed">
              {preview}
            </div>
          </div>
          {(c.messageLog || []).length > 0 && (
            <div className="col-span-full">
              <div className="mb-2 text-sm font-semibold">Recent Message Log</div>
              <div className="space-y-2">
                {[...(c.messageLog || [])].reverse().slice(0, 5).map((m) => (
                  <div
                    key={m.id}
                    className="rounded-xl border border-border bg-secondary p-3 text-xs"
                  >
                    <strong>
                      {m.template} · {new Date(m.timestamp).toLocaleString()}
                    </strong>
                    <div className="mt-1 text-muted">{m.message}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
        <div className="flex flex-wrap justify-end gap-2 border-t border-border px-6 py-4">
          <button
            type="button"
            className="rounded border border-border bg-secondary px-4 py-2 text-sm"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(preview);
                toast("Message copied", "success");
              } catch {
                toast("Could not copy message", "error");
              }
            }}
          >
            Copy Message
          </button>
          <button
            type="button"
            className="rounded border border-border bg-secondary px-4 py-2 text-sm"
            onClick={logMessage}
          >
            Log Sent
          </button>
          <button
            type="button"
            className="rounded bg-success px-4 py-2 text-sm font-medium text-white"
            onClick={openWhatsApp}
          >
            Open WhatsApp
          </button>
          {queueTotal > 1 && onNext && (
            <button
              type="button"
              className="rounded bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
              onClick={onNext}
            >
              {queueIndex + 1 < queueTotal ? "Next →" : "Done"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
