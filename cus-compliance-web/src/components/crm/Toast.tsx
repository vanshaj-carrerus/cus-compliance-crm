"use client";

import { useCrm } from "./CrmProvider";

export function ToastContainer() {
  const { toasts } = useCrm();
  return (
    <div className="fixed inset-x-3 top-[max(0.75rem,env(safe-area-inset-top))] z-[2000] flex flex-col gap-2 sm:inset-x-auto sm:right-5 sm:top-5 sm:max-w-sm">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`flex w-full items-center gap-2.5 rounded-[var(--radius)] border border-border bg-card px-4 py-3 shadow-lg sm:min-w-[280px] sm:px-5 sm:py-3.5 ${
            t.type === "success"
              ? "border-l-4 border-l-success"
              : t.type === "error"
                ? "border-l-4 border-l-danger"
                : "border-l-4 border-l-primary"
          }`}
        >
          <span>
            {t.type === "success" ? "✓" : t.type === "error" ? "✕" : "ℹ"}
          </span>
          <span className="text-sm leading-snug">{t.message}</span>
        </div>
      ))}
    </div>
  );
}
