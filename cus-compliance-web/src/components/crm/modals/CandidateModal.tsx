"use client";

import { useEffect, useState } from "react";
import { useCrm } from "../CrmProvider";
import { money } from "@/lib/crm/calc";
import {
  CONTACT_METHODS,
  DEFAULT_STATUSES,
  type Candidate,
  type Installment,
} from "@/lib/crm/types";
import {
  MAX_INSTALLMENTS,
  isEmptyInstallment,
  normalizeInst,
} from "@/lib/crm/normalize";

type FormState = {
  name: string;
  phoneNumber: string;
  candidateNumber: string;
  assignedTo: "Yatin" | "Jayraj";
  floor: string;
  annualPackage: string;
  serviceFeePercent: string;
  terms: string;
  po: string;
  poMonth: string;
  startDate: string;
  status: string;
  customStatus: string;
  remarks: string;
  installmentCount: string;
  lastContactDate: string;
  nextFollowUpDate: string;
  contactMethod: Candidate["contactMethod"];
  contactNotes: string;
  expectedDate: string;
  expectedAmount: string;
  monthRemarks: string;
  targetPaidManual: boolean;
  installments: Installment[];
};

function emptyInstallment(): Installment {
  return normalizeInst(null);
}

function installmentsFromCandidate(c: Candidate): Installment[] {
  const filled = (c.installments || [])
    .map((inst) => normalizeInst(inst))
    .filter((inst) => !isEmptyInstallment(inst));
  return filled.length ? filled : [emptyInstallment()];
}

function createEmptyForm(): FormState {
  return {
    name: "",
    phoneNumber: "",
    candidateNumber: "",
    assignedTo: "Yatin",
    floor: "",
    annualPackage: "",
    serviceFeePercent: "",
    terms: "",
    po: "",
    poMonth: "",
    startDate: "",
    status: "Active",
    customStatus: "",
    remarks: "",
    installmentCount: "",
    lastContactDate: "",
    nextFollowUpDate: "",
    contactMethod: "No Contact",
    contactNotes: "",
    expectedDate: "",
    expectedAmount: "",
    monthRemarks: "",
    targetPaidManual: false,
    installments: [emptyInstallment()],
  };
}

function formFromCandidate(c: Candidate): FormState {
  const isCustom = !DEFAULT_STATUSES.includes(
    c.status as (typeof DEFAULT_STATUSES)[number]
  );
  return {
    name: c.name,
    phoneNumber: c.phoneNumber,
    candidateNumber: c.candidateNumber,
    assignedTo: c.assignedTo,
    floor: c.floor,
    annualPackage: String(c.annualPackage || ""),
    serviceFeePercent: String(c.serviceFeePercent || ""),
    terms: c.terms,
    po: c.po,
    poMonth: c.poMonth,
    startDate: c.startDate,
    status: isCustom ? "Custom" : c.status,
    customStatus: isCustom ? c.status : "",
    remarks: c.remarks,
    installmentCount: String(c.installmentCount || ""),
    lastContactDate: c.lastContactDate,
    nextFollowUpDate: c.nextFollowUpDate,
    contactMethod: c.contactMethod,
    contactNotes: c.contactNotes,
    expectedDate: c.expectedDate || "",
    expectedAmount: String(c.expectedAmount ?? ""),
    monthRemarks: c.monthRemarks || "",
    targetPaidManual: !!c.targetPaidManual,
    installments: installmentsFromCandidate(c),
  };
}

function Field({
  label,
  children,
  className = "",
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={`flex flex-col gap-1.5 ${className}`}>
      <span className="text-xs font-medium uppercase tracking-wide text-muted">
        {label}
      </span>
      {children}
    </label>
  );
}

const inputCls =
  "rounded-[var(--radius)] border border-border bg-input px-3.5 py-2.5 text-sm outline-none focus:border-primary";

export function CandidateModal() {
  const {
    candidateModalOpen,
    closeModals,
    editingId,
    candidates,
    saveCandidateForm,
  } = useCrm();

  const [form, setForm] = useState<FormState>(createEmptyForm());

  useEffect(() => {
    if (!candidateModalOpen) return;
    if (editingId) {
      const candidate = candidates.find((x) => x.id === editingId);
      if (candidate) setForm(formFromCandidate(candidate));
    } else {
      setForm(createEmptyForm());
    }
  }, [candidateModalOpen, editingId, candidates]);

  if (!candidateModalOpen) return null;

  const totalFee =
    ((Number(form.annualPackage) || 0) *
      (Number(form.serviceFeePercent) || 0)) /
    100;

  const setValue = (key: keyof FormState, value: string | boolean) => {
    setForm((f) => ({ ...f, [key]: value }));
  };

  const setInstallment = (
    idx: number,
    key: keyof Installment,
    value: string | boolean
  ) => {
    setForm((f) => {
      const installments = [...f.installments];
      installments[idx] = { ...installments[idx], [key]: value };
      return { ...f, installments };
    });
  };

  const addInstallment = () => {
    if (form.installments.length >= MAX_INSTALLMENTS) return;
    setForm((f) => ({
      ...f,
      installments: [...f.installments, emptyInstallment()],
    }));
  };

  const removeInstallment = (idx: number) => {
    setForm((f) => {
      if (f.installments.length <= 1) return f;
      const installments = f.installments.filter((_, i) => i !== idx);
      return { ...f, installments };
    });
  };

  const filledInstallmentCount = form.installments.filter(
    (inst) => !isEmptyInstallment(normalizeInst(inst))
  ).length;

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/50 p-4">
      <div className="max-h-[92vh] w-full max-w-[1180px] overflow-auto rounded-[var(--radius)] border border-border bg-card shadow-xl">
        <div className="flex items-center justify-between border-b border-border px-6 py-5">
          <div className="text-lg font-semibold">
            {editingId ? "Edit Candidate" : "Add Candidate"}
          </div>
          <button
            type="button"
            className="text-2xl text-muted"
            onClick={closeModals}
          >
            ×
          </button>
        </div>

        <div className="space-y-6 p-6">
          <section>
            <div className="mb-3 text-sm font-semibold text-primary">
              Candidate Details
            </div>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
              {(
                [
                  ["name", "Candidate Name", "text"],
                  ["phoneNumber", "Phone Number", "text"],
                  ["candidateNumber", "Candidate Number", "text"],
                  ["floor", "Office / Floor", "text"],
                  ["annualPackage", "Annual Package", "number"],
                  ["serviceFeePercent", "Service Fee %", "number"],
                  ["terms", "Terms", "text"],
                  ["po", "P.O Number", "text"],
                  ["poMonth", "P.O Month", "text"],
                  ["startDate", "Start Date", "date"],
                  ["installmentCount", "Installment Count", "number"],
                ] as const
              ).map(([key, label, type]) => (
                <Field key={key} label={label}>
                  <input
                    type={type}
                    className={inputCls}
                    value={form[key]}
                    onChange={(e) => setValue(key, e.target.value)}
                  />
                </Field>
              ))}

              <Field label="Assigned To">
                <select
                  className={inputCls}
                  value={form.assignedTo}
                  onChange={(e) =>
                    setValue("assignedTo", e.target.value as "Yatin" | "Jayraj")
                  }
                >
                  <option>Yatin</option>
                  <option>Jayraj</option>
                </select>
              </Field>

              <Field label="Status">
                <select
                  className={inputCls}
                  value={form.status}
                  onChange={(e) => setValue("status", e.target.value)}
                >
                  {DEFAULT_STATUSES.map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
              </Field>

              {form.status === "Custom" && (
                <Field label="Custom Status">
                  <input
                    className={inputCls}
                    value={form.customStatus}
                    onChange={(e) => setValue("customStatus", e.target.value)}
                  />
                </Field>
              )}

              <Field label="Total Service Fee">
                <input
                  readOnly
                  className={`${inputCls} bg-secondary font-semibold text-primary`}
                  value={money(totalFee)}
                />
              </Field>

              <Field label="Expected Amount">
                <input
                  className={inputCls}
                  value={form.expectedAmount}
                  onChange={(e) => setValue("expectedAmount", e.target.value)}
                />
              </Field>

              <Field label="Expected Date">
                <input
                  type="date"
                  className={inputCls}
                  value={form.expectedDate}
                  onChange={(e) => setValue("expectedDate", e.target.value)}
                />
              </Field>

              <Field label="Target Paid Manual" className="justify-end">
                <input
                  type="checkbox"
                  className="h-5 w-5 accent-[var(--primary)]"
                  checked={form.targetPaidManual}
                  onChange={(e) => setValue("targetPaidManual", e.target.checked)}
                />
              </Field>

              <Field label="Remarks" className="xl:col-span-2">
                <textarea
                  className={`${inputCls} min-h-[90px]`}
                  value={form.remarks}
                  onChange={(e) => setValue("remarks", e.target.value)}
                />
              </Field>

              <Field label="Month Remarks" className="xl:col-span-2">
                <textarea
                  className={`${inputCls} min-h-[90px]`}
                  value={form.monthRemarks}
                  onChange={(e) => setValue("monthRemarks", e.target.value)}
                />
              </Field>
            </div>
          </section>

          <section>
            <div className="mb-3 text-sm font-semibold text-primary">
              Follow-up & Contact
            </div>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
              <Field label="Last Contact Date">
                <input
                  type="date"
                  className={inputCls}
                  value={form.lastContactDate}
                  onChange={(e) => setValue("lastContactDate", e.target.value)}
                />
              </Field>
              <Field label="Next Follow-up Date">
                <input
                  type="date"
                  className={inputCls}
                  value={form.nextFollowUpDate}
                  onChange={(e) => setValue("nextFollowUpDate", e.target.value)}
                />
              </Field>
              <Field label="Contact Method">
                <select
                  className={inputCls}
                  value={form.contactMethod}
                  onChange={(e) =>
                    setValue(
                      "contactMethod",
                      e.target.value as Candidate["contactMethod"]
                    )
                  }
                >
                  {CONTACT_METHODS.map((method) => (
                    <option key={method}>{method}</option>
                  ))}
                </select>
              </Field>
              <Field label="Contact Notes" className="md:col-span-2 xl:col-span-4">
                <textarea
                  className={`${inputCls} min-h-[90px]`}
                  value={form.contactNotes}
                  onChange={(e) => setValue("contactNotes", e.target.value)}
                />
              </Field>
            </div>
          </section>

          <section>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-primary">
                  Installments
                </div>
                <div className="mt-1 text-xs text-muted">
                  {form.installments.length} of {MAX_INSTALLMENTS} slots ·{" "}
                  {filledInstallmentCount} filled
                </div>
              </div>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                disabled={form.installments.length >= MAX_INSTALLMENTS}
                onClick={addInstallment}
              >
                + Add Installment
              </button>
            </div>
            <div className="space-y-4">
              {form.installments.map((inst, idx) => (
                <div key={idx} className="installment-card">
                  <div className="installment-card-head">
                    <div className="installment-card-title">
                      Installment {idx + 1}
                    </div>
                    <button
                      type="button"
                      className="btn btn-danger btn-sm"
                      disabled={form.installments.length <= 1}
                      onClick={() => removeInstallment(idx)}
                    >
                      Remove
                    </button>
                  </div>
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-6">
                    <Field label="Amount">
                      <input
                        className={inputCls}
                        value={inst.amount}
                        onChange={(e) =>
                          setInstallment(idx, "amount", e.target.value)
                        }
                      />
                    </Field>
                    <Field label="Due Date">
                      <input
                        type="date"
                        className={inputCls}
                        value={inst.date}
                        onChange={(e) =>
                          setInstallment(idx, "date", e.target.value)
                        }
                      />
                    </Field>
                    <Field label="Payment Date">
                      <input
                        type="date"
                        className={inputCls}
                        value={inst.paymentDate}
                        onChange={(e) =>
                          setInstallment(idx, "paymentDate", e.target.value)
                        }
                      />
                    </Field>
                    <Field label="Receipt">
                      <input
                        className={inputCls}
                        value={inst.receipt}
                        onChange={(e) =>
                          setInstallment(idx, "receipt", e.target.value)
                        }
                      />
                    </Field>
                    <Field label="Paid" className="justify-end">
                      <input
                        type="checkbox"
                        className="h-5 w-5 accent-[var(--primary)]"
                        checked={inst.paid}
                        onChange={(e) =>
                          setInstallment(idx, "paid", e.target.checked)
                        }
                      />
                    </Field>
                    <Field label="Notes" className="md:col-span-2 xl:col-span-6">
                      <textarea
                        className={`${inputCls} min-h-[70px]`}
                        value={inst.notes}
                        onChange={(e) =>
                          setInstallment(idx, "notes", e.target.value)
                        }
                      />
                    </Field>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>

        <div className="flex justify-end gap-2.5 border-t border-border px-6 py-4">
          <button
            type="button"
            className="rounded-[var(--radius)] border border-border bg-secondary px-4 py-2 text-sm"
            onClick={closeModals}
          >
            Cancel
          </button>
          <button
            type="button"
            className="rounded-[var(--radius)] bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
            onClick={() => {
              const count =
                Number(form.installmentCount) || filledInstallmentCount || 1;
              saveCandidateForm({
                name: form.name,
                phoneNumber: form.phoneNumber,
                candidateNumber: form.candidateNumber,
                assignedTo: form.assignedTo,
                floor: form.floor,
                annualPackage: Number(form.annualPackage) || 0,
                serviceFeePercent: Number(form.serviceFeePercent) || 0,
                terms: form.terms,
                po: form.po,
                poMonth: form.poMonth,
                startDate: form.startDate,
                status:
                  form.status === "Custom"
                    ? form.customStatus.trim() || "Custom"
                    : form.status,
                remarks: form.remarks,
                installmentCount: count,
                lastContactDate: form.lastContactDate,
                nextFollowUpDate: form.nextFollowUpDate,
                contactMethod: form.contactMethod,
                contactNotes: form.contactNotes,
                expectedDate: form.expectedDate,
                expectedAmount: form.expectedAmount,
                monthRemarks: form.monthRemarks,
                targetPaidManual: form.targetPaidManual,
                installments: form.installments.map((inst) =>
                  normalizeInst(inst)
                ),
              });
            }}
          >
            Save Candidate
          </button>
        </div>
      </div>
    </div>
  );
}
