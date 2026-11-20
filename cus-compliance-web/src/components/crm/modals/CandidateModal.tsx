"use client";

import { assigneeOptions, assigneeValue } from "@/lib/assignees";
import { useEffect, useRef, useState } from "react";
import { useCrm } from "../CrmProvider";
import { useAuth } from "../AuthProvider";
import { readFormDraft, writeFormDraft } from "@/lib/crm/drafts";
import { MonthYearPicker } from "../MonthYearPicker";
import { CopyPhoneButton } from "../shared";
import { DatePicker } from "../DatePicker";
import { money } from "@/lib/crm/calc";
import {
  CONTACT_METHODS,
  DEFAULT_STATUSES,
  SALARY_TYPES,
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
  assignedTo: string;
  floor: string;
  annualPackage: string;
  serviceFeePercent: string;
  terms: string;
  po: string;
  poMonth: string;
  startDate: string;
  salaryType: string;
  monthlyInstallment: string;
  status: string;
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
  removedFromPaymentTarget: boolean;
  installments: Installment[];
};

function emptyInstallment(): Installment {
  return normalizeInst(null);
}

function canMarkInstallmentPaid(inst: Installment): boolean {
  return !!String(inst.amount || "").trim() && !!inst.date;
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
    assignedTo: "",
    floor: "",
    annualPackage: "",
    serviceFeePercent: "",
    terms: "",
    po: "",
    poMonth: "",
    startDate: "",
    salaryType: "",
    monthlyInstallment: "",
    status: "",
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
    removedFromPaymentTarget: false,
    installments: [emptyInstallment()],
  };
}

function formFromCandidate(c: Candidate): FormState {
  return {
    name: c.name,
    phoneNumber: c.phoneNumber,
    assignedTo: c.assignedTo,
    floor: c.floor,
    annualPackage: String(c.annualPackage || ""),
    serviceFeePercent: String(c.serviceFeePercent || ""),
    terms: c.terms,
    po: c.po,
    poMonth: c.poMonth,
    startDate: c.startDate,
    salaryType: c.salaryType || "",
    monthlyInstallment: String(c.monthlyInstallment || ""),
    status: c.status,
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
    removedFromPaymentTarget: !!c.removedFromPaymentTarget,
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
  "rounded-(--radius) border border-border bg-input px-3.5 py-2.5 text-sm outline-none focus:border-primary";

export function CandidateModal() {
  const {
    candidateModalOpen,
    closeModals,
    editingId,
    candidates,
    saveCandidateForm,
    assignableUsers,
  } = useCrm();

  const { user } = useAuth();
  const userKey = user?.id || user?.email || "anon";
  const [form, setForm] = useState<FormState>(createEmptyForm());
  const baseline = useRef("");
  const initKey = useRef<string | null>(null);

  // Initialise the form once per open (not on every background change to
  // `candidates`, which used to overwrite whatever was being typed).
  useEffect(() => {
    if (!candidateModalOpen) {
      initKey.current = null;
      return;
    }
    const key = String(editingId ?? "new");
    if (initKey.current === key) return;
    initKey.current = key;
    const candidate = editingId
      ? candidates.find((x) => x.id === editingId)
      : undefined;
    const base = candidate ? formFromCandidate(candidate) : createEmptyForm();
    baseline.current = JSON.stringify(base);
    const draft = readFormDraft(userKey);
    if (draft && (draft.editingId ?? null) === (editingId ?? null)) {
      setForm({ ...base, ...(draft.form as Partial<FormState>) });
    } else {
      setForm(base);
    }
  }, [candidateModalOpen, editingId, candidates, userKey]);

  // Every change to the form is mirrored to localStorage immediately.
  useEffect(() => {
    if (!candidateModalOpen || initKey.current === null) return;
    const json = JSON.stringify(form);
    if (json === baseline.current) return;
    writeFormDraft(userKey, {
      editingId: editingId ?? null,
      form,
      ts: Date.now(),
    });
  }, [form, candidateModalOpen, editingId, userKey]);

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
      const updated = { ...installments[idx], [key]: value };
      if (
        (key === "amount" || key === "date") &&
        !canMarkInstallmentPaid(updated)
      ) {
        updated.paid = false;
      }
      installments[idx] = updated;
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
    <div
      data-modal-overlay
      data-track-unsaved
      className="fixed inset-0 z-4000 flex items-center justify-center bg-black/50 p-4"
    >
      <div className="max-h-[92vh] w-full max-w-295 overflow-auto rounded-(--radius) border border-border bg-card shadow-xl">
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
                  ["floor", "Office / Floor", "text"],
                  ["annualPackage", "Annual Package", "number"],
                  ["serviceFeePercent", "Service Fee %", "number"],
                  ["terms", "Terms", "text"],
                  ["po", "P.O Number", "text"],
                  ["installmentCount", "Installment Count", "number"],
                  ["monthlyInstallment", "Monthly Installment", "number"],
                ] as const
              ).map(([key, label, type]) => (
                <Field key={key} label={label}>
                  {key === "phoneNumber" ? (
                    <div className="flex items-center gap-1">
                      <input
                        type={type}
                        className={inputCls}
                        value={form[key]}
                        onChange={(e) => setValue(key, e.target.value)}
                      />
                      <CopyPhoneButton value={form.phoneNumber} />
                    </div>
                  ) : (
                    <input
                      type={type}
                      className={inputCls}
                      value={form[key]}
                      onChange={(e) => setValue(key, e.target.value)}
                    />
                  )}
                </Field>
              ))}

              <Field label="P.O Month">
                <MonthYearPicker
                  value={form.poMonth}
                  onChange={(v) => setValue("poMonth", v)}
                />
              </Field>

              <Field label="Start Date">
                <DatePicker
                  value={form.startDate}
                  onChange={(v) => setValue("startDate", v)}
                />
              </Field>

              <Field label="Salary Type">
                <select
                  className={inputCls}
                  value={form.salaryType}
                  onChange={(e) => setValue("salaryType", e.target.value)}
                >
                  <option value="">Select…</option>
                  {SALARY_TYPES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </Field>

              <Field label="Assigned To">
                <select
                  className={inputCls}
                  value={assigneeValue(assignableUsers, form.assignedTo)}
                  onChange={(e) => setValue("assignedTo", e.target.value)}
                >
                  <option value="">Select…</option>
                  {assigneeOptions(assignableUsers, form.assignedTo).map((name) => (
                    <option key={name}>{name}</option>
                  ))}
                </select>
              </Field>

              <Field label="Status">
                <select
                  className={inputCls}
                  value={form.status}
                  onChange={(e) => setValue("status", e.target.value)}
                >
                  <option value="">Active</option>
                  {DEFAULT_STATUSES.map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
              </Field>

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
                <DatePicker
                  value={form.expectedDate}
                  onChange={(v) => setValue("expectedDate", v)}
                />
              </Field>

              <Field label="Target Paid Manual" className="justify-end">
                <input
                  type="checkbox"
                  className="h-5 w-5 accent-primary"
                  checked={form.targetPaidManual}
                  onChange={(e) => setValue("targetPaidManual", e.target.checked)}
                />
              </Field>

              <Field
                label="Removed from Payment Target"
                className="justify-end"
              >
                <div className="flex items-center gap-4 text-sm">
                  {[
                    { label: "Yes", value: true },
                    { label: "No", value: false },
                  ].map((o) => (
                    <label key={o.label} className="flex items-center gap-1.5">
                      <input
                        type="radio"
                        name="removedFromPaymentTarget"
                        className="h-4 w-4 accent-primary"
                        checked={form.removedFromPaymentTarget === o.value}
                        onChange={() =>
                          setValue("removedFromPaymentTarget", o.value)
                        }
                      />
                      {o.label}
                    </label>
                  ))}
                </div>
              </Field>

              <Field label="Remarks" className="xl:col-span-2">
                <textarea
                  className={`${inputCls} min-h-22.5`}
                  value={form.remarks}
                  onChange={(e) => setValue("remarks", e.target.value)}
                />
              </Field>

              <Field label="Month Remarks" className="xl:col-span-2">
                <textarea
                  className={`${inputCls} min-h-22.5`}
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
                <DatePicker
                  value={form.lastContactDate}
                  onChange={(v) => setValue("lastContactDate", v)}
                />
              </Field>
              <Field label="Next Follow-up Date">
                <DatePicker
                  value={form.nextFollowUpDate}
                  onChange={(v) => setValue("nextFollowUpDate", v)}
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
                  className={`${inputCls} min-h-22.5`}
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
                      <DatePicker
                        value={inst.date}
                        onChange={(v) => setInstallment(idx, "date", v)}
                      />
                    </Field>
                    <Field label="Payment Date">
                      <DatePicker
                        value={inst.paymentDate}
                        onChange={(v) =>
                          setInstallment(idx, "paymentDate", v)
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
                        className="h-5 w-5 accent-primary disabled:cursor-not-allowed disabled:opacity-40"
                        checked={inst.paid}
                        disabled={!canMarkInstallmentPaid(inst)}
                        title={
                          canMarkInstallmentPaid(inst)
                            ? ""
                            : "Set the amount and due date before marking as paid"
                        }
                        onChange={(e) =>
                          setInstallment(idx, "paid", e.target.checked)
                        }
                      />
                    </Field>
                    <Field label="Notes" className="md:col-span-2 xl:col-span-6">
                      <textarea
                        className={`${inputCls} min-h-17.5`}
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
            className="rounded-(--radius) border border-border bg-secondary px-4 py-2 text-sm"
            onClick={closeModals}
          >
            Cancel
          </button>
          <button
            type="button"
            className="rounded-(--radius) bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
            onClick={() => {
              const count =
                Number(form.installmentCount) || filledInstallmentCount || 1;
              saveCandidateForm({
                name: form.name,
                phoneNumber: form.phoneNumber,
                assignedTo: form.assignedTo,
                floor: form.floor,
                annualPackage: Number(form.annualPackage) || 0,
                serviceFeePercent: Number(form.serviceFeePercent) || 0,
                terms: form.terms,
                po: form.po,
                poMonth: form.poMonth,
                startDate: form.startDate,
                salaryType: form.salaryType as Candidate["salaryType"],
                monthlyInstallment: Number(form.monthlyInstallment) || 0,
                status: form.status,
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
                removedFromPaymentTarget: form.removedFromPaymentTarget,
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
