"use client";

import { useRef, useState } from "react";
import { useCrm } from "../CrmProvider";
import {
  normalizeCandidate,
  mergeSettings,
  parseCrmWorkbook,
} from "@/lib/crm";

export function ImportModal() {
  const {
    importModalOpen,
    setImportModalOpen,
    replaceAll,
    toast,
    closeModals,
  } = useCrm();
  const inputRef = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);

  if (!importModalOpen) return null;

  const handleFile = async (file?: File | null) => {
    if (!file) return;
    try {
      const data = await parseCrmWorkbook(await file.arrayBuffer());
      if (!Array.isArray(data.candidates))
        throw new Error("Invalid backup file");
      if (
        !confirm("Restore this backup? Current CRM data will be replaced.")
      )
        return;
      const candidates = data.candidates.map((candidate) =>
        normalizeCandidate(candidate)
      );
      await replaceAll(
        candidates,
        Array.isArray(data.history) ? data.history : [],
        mergeSettings(data.settings || null)
      );
      closeModals();
    } catch {
      toast("Invalid backup file", "error");
    }
  };

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-[760px] rounded-[var(--radius)] border border-border bg-card shadow-xl">
        <div className="flex items-center justify-between border-b border-border px-6 py-5">
          <div className="text-lg font-semibold">Import / Restore Excel</div>
          <button
            type="button"
            className="text-2xl text-muted"
            onClick={() => setImportModalOpen(false)}
          >
            ×
          </button>
        </div>
        <div className="p-6">
          <div
            className={`cursor-pointer rounded-[var(--radius)] border-2 border-dashed p-8 text-center transition-colors ${
              drag
                ? "border-primary bg-primary/10"
                : "border-border hover:border-primary hover:bg-primary/5"
            }`}
            onClick={() => inputRef.current?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              setDrag(true);
            }}
            onDragLeave={() => setDrag(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDrag(false);
              handleFile(e.dataTransfer.files[0]);
            }}
          >
            <div className="mb-2 text-3xl">📁</div>
            <div className="mb-1 font-semibold">
              Drop Excel backup here or click to browse
            </div>
            <div className="text-xs text-muted">
              Use files exported from this CRM
            </div>
          </div>
          <input
            ref={inputRef}
            type="file"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            className="hidden"
            onChange={(e) => handleFile(e.target.files?.[0])}
          />
          <p className="mt-4 text-xs text-muted">
            This import replaces current data only after confirmation.
          </p>
        </div>
      </div>
    </div>
  );
}
