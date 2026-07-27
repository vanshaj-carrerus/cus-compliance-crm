"use client";

import { useAuth } from "./AuthProvider";
import { useCrm } from "./CrmProvider";
import type { CrmView } from "@/lib/crm/types";
import { todayIso, statusExcluded } from "@/lib/crm";

const NAV: { view: CrmView; icon: string; label: string }[] = [
  { view: "dashboard", icon: "📊", label: "Dashboard" },
  { view: "daily", icon: "📅", label: "Daily Follow-up" },
  { view: "master", icon: "📋", label: "Master P.O Sheet" },
  { view: "compliance", icon: "✅", label: "Compliance Sheet" },
  { view: "target", icon: "🎯", label: "Payment Target" },
  { view: "incentive", icon: "💰", label: "Incentive Sheet" },
  { view: "history", icon: "📜", label: "Payment History" },
  { view: "reports", icon: "📈", label: "Reports" },
  { view: "workflows", icon: "⚙️", label: "Workflows" },
  { view: "backup", icon: "💾", label: "Backup & Restore" },
  { view: "admin", icon: "👥", label: "Admin Users" },
];

export function Sidebar() {
  const { canView } = useAuth();
  const {
    ready,
    currentView,
    navigate,
    sidebarCollapsed,
    setSidebarCollapsed,
    setSidebarOpen,
    candidates,
    dbSizeKb,
  } = useCrm();

  const navItems = NAV.filter((item) => canView(item.view));

  const overdueFollowups = ready
    ? candidates.filter(
        (c) =>
          c.nextFollowUpDate &&
          c.nextFollowUpDate < todayIso() &&
          !statusExcluded(c.status)
      ).length
    : 0;

  /** Absolute overlay drawer — open when not collapsed. */
  const open = !sidebarCollapsed;

  const close = () => {
    setSidebarCollapsed(true);
    setSidebarOpen(false);
  };

  const go = (view: CrmView) => {
    navigate(view);
    // Keep full labels; close drawer after pick so content stays usable
    close();
  };

  return (
    <>
      {open && (
        <div
          className="absolute inset-0 z-[1400] bg-black/30 backdrop-blur-[1px]"
          onClick={close}
          aria-hidden
        />
      )}
      <nav
        className={`absolute left-0 top-0 bottom-0 z-[1500] flex w-[min(240px,88vw)] flex-col border-r border-border bg-sidebar shadow-xl transition-transform duration-200 ease-out ${
          open ? "translate-x-0" : "-translate-x-full pointer-events-none"
        }`}
        aria-hidden={!open}
      >
        <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border px-3 py-3">
          <div className="min-w-0">
            <h1 className="truncate text-sm font-bold tracking-wide text-primary">
              CareerUS Solutions
            </h1>
            <p className="mt-0.5 text-[10px] uppercase tracking-widest text-muted">
              Compliance CRM
            </p>
          </div>
          <button
            type="button"
            className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-border bg-secondary text-base leading-none text-muted hover:bg-border"
            onClick={close}
            aria-label="Close menu"
            title="Close menu"
          >
            ×
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-1.5 py-1.5">
          {navItems.map((item) => {
            const active = currentView === item.view;
            return (
              <button
                key={item.view}
                type="button"
                onClick={() => go(item.view)}
                title={item.label}
                className={`mb-0.5 flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[13px] leading-tight transition-colors ${
                  active
                    ? "bg-secondary font-semibold text-primary"
                    : "text-muted hover:bg-secondary/80 hover:text-foreground"
                }`}
              >
                <span
                  className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-sm ${
                    active ? "bg-primary/10" : "bg-secondary"
                  }`}
                >
                  {item.icon}
                </span>
                <span className="min-w-0 flex-1">{item.label}</span>
                {item.view === "daily" && overdueFollowups > 0 && (
                  <span className="inline-flex min-w-5 shrink-0 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-black text-white">
                    {overdueFollowups}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <div className="shrink-0 border-t border-border px-3 py-2.5 text-[10px] leading-relaxed text-muted">
          <div>v3.30 Priority Master</div>
          <div>MongoDB Mode · DB: {dbSizeKb} KB</div>
        </div>
      </nav>
    </>
  );
}
