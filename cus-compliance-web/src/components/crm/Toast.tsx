"use client";

import { Check, Info, X } from "lucide-react";
import { useCrm } from "./CrmProvider";

export function ToastContainer() {
  const { toasts } = useCrm();
  return (
    <div className="fixed inset-x-3 top-[max(0.75rem,env(safe-area-inset-top))] z-[2000] flex flex-col gap-2.5 sm:inset-x-auto sm:right-5 sm:top-5 sm:max-w-sm">
      {toasts.map((t) => (
        <div
          key={t.id}
          style={
            {
              "--toast-accent":
                t.type === "success"
                  ? "var(--success)"
                  : t.type === "error"
                    ? "var(--danger)"
                    : "var(--primary)",
            } as React.CSSProperties
          }
          className="crm-toast flex w-full items-center gap-3 border border-border bg-card py-3 pl-5 pr-5 sm:min-w-[300px] sm:py-3.5"
        >
          <span className="crm-toast-icon">
            {t.type === "success" ? (
              <Check className="h-3.5 w-3.5" strokeWidth={3} />
            ) : t.type === "error" ? (
              <X className="h-3.5 w-3.5" strokeWidth={3} />
            ) : (
              <Info className="h-3.5 w-3.5" strokeWidth={2.6} />
            )}
          </span>
          <span className="text-sm font-medium leading-snug text-(--ink)">{t.message}</span>
        </div>
      ))}
    </div>
  );
}
