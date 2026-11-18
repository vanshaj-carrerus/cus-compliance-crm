"use client";

import { useEffect, useMemo } from "react";
import { downloadBlob } from "@/lib/crm";
import type { Candidate } from "@/lib/crm/types";
import {
  canvasToPdfBlob,
  canvasToPngBlob,
  renderStatementCanvas,
  statementFileName,
} from "@/lib/crm/statement";

export function StatementModal({
  candidate,
  onClose,
}: {
  candidate: Candidate;
  onClose: () => void;
}) {
  const canvas = useMemo(() => renderStatementCanvas(candidate), [candidate]);
  const previewUrl = useMemo(() => canvas.toDataURL("image/png"), [canvas]);
  const base = statementFileName(candidate);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const savePng = async () => {
    downloadBlob(await canvasToPngBlob(canvas), `${base}.png`, "image/png");
  };
  const savePdf = () => {
    downloadBlob(canvasToPdfBlob(canvas), `${base}.pdf`, "application/pdf");
  };

  return (
    <div
      data-modal-overlay
      className="fixed inset-0 z-4200 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="flex max-h-[92vh] w-full max-w-205 flex-col overflow-hidden rounded-[26px] border border-border bg-card shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-border px-6 py-5">
          <div>
            <div className="text-xl font-bold">🧾 Payment Statement</div>
            <div className="mt-1 text-xs text-muted">{candidate.name || "Unnamed"}</div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded border border-border bg-secondary px-2.5 py-1 text-sm"
          >
            ✕
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-auto bg-secondary p-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={previewUrl}
            alt={`Payment statement for ${candidate.name}`}
            className="mx-auto w-full max-w-190 rounded-lg shadow"
          />
        </div>
        <div className="flex flex-wrap justify-end gap-2 border-t border-border px-6 py-4">
          <button
            type="button"
            onClick={savePng}
            className="rounded-lg border border-border bg-secondary px-4 py-2 text-sm font-semibold"
          >
            ⬇ Download Image (PNG)
          </button>
          <button
            type="button"
            onClick={savePdf}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white"
          >
            ⬇ Download PDF
          </button>
        </div>
      </div>
    </div>
  );
}
