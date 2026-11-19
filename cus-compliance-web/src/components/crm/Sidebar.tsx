"use client";

import { useLayoutEffect, useRef, type ReactNode } from "react";
import {
  CalendarClock,
  ChartColumn,
  DatabaseBackup,
  History,
  LayoutDashboard,
  ListChecks,
  Table2,
  Target,
  Users,
  Settings,
  Wallet,
  Workflow,
  X,
} from "lucide-react";
import { useAuth } from "./AuthProvider";
import { useCrm } from "./CrmProvider";
import type { CrmView } from "@/lib/crm/types";
import { todayIso, statusExcluded } from "@/lib/crm";

const ICON_CLS = "h-[17px] w-[17px]";

export const NAV: { view: CrmView; icon: ReactNode; label: string }[] = [
  { view: "dashboard", icon: <LayoutDashboard className={ICON_CLS} strokeWidth={1.9} />, label: "Dashboard" },
  { view: "daily", icon: <CalendarClock className={ICON_CLS} strokeWidth={1.9} />, label: "Daily Follow-up" },
  { view: "master", icon: <Table2 className={ICON_CLS} strokeWidth={1.9} />, label: "Master P.O Sheet" },
  { view: "compliance", icon: <ListChecks className={ICON_CLS} strokeWidth={1.9} />, label: "Compliance Sheet" },
  { view: "target", icon: <Target className={ICON_CLS} strokeWidth={1.9} />, label: "Payment Target" },
  { view: "incentive", icon: <Wallet className={ICON_CLS} strokeWidth={1.9} />, label: "Incentive Sheet" },
  { view: "history", icon: <History className={ICON_CLS} strokeWidth={1.9} />, label: "Payment History" },
  { view: "reports", icon: <ChartColumn className={ICON_CLS} strokeWidth={1.9} />, label: "Reports" },
  { view: "workflows", icon: <Workflow className={ICON_CLS} strokeWidth={1.9} />, label: "Workflows" },
  { view: "backup", icon: <DatabaseBackup className={ICON_CLS} strokeWidth={1.9} />, label: "Backup & Restore" },
  { view: "admin", icon: <Users className={ICON_CLS} strokeWidth={1.9} />, label: "Admin Users" },
  { view: "settings", icon: <Settings className={ICON_CLS} strokeWidth={1.9} />, label: "Settings" },
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

  // Liquid Glass: one capsule that glides between items (purely visual; it is
  // positioned straight on the DOM node so no extra renders are triggered).
  const listRef = useRef<HTMLDivElement>(null);
  const capsuleRef = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    const cap = capsuleRef.current;
    const active = listRef.current?.querySelector<HTMLElement>(".nav-item.is-active");
    if (!cap) return;
    if (!active) {
      cap.style.opacity = "0";
      return;
    }
    cap.style.height = active.offsetHeight + "px";
    cap.style.transform = "translate3d(0," + active.offsetTop + "px,0)";
    cap.style.opacity = "1";
  });

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
          className="crm-nav-scrim absolute inset-0 z-1400 bg-black/30"
          onClick={close}
          aria-hidden
        />
      )}
      <nav
        className={`crm-nav absolute left-0 top-0 bottom-0 z-1500 flex w-[min(260px,88vw)] flex-col border-r border-border bg-sidebar shadow-xl ${
          open ? "translate-x-0" : "is-closed -translate-x-[110%] pointer-events-none"
        }`}
        aria-hidden={!open}
      >
        <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border px-4 py-4">
          <div className="flex min-w-0 items-center gap-3">
            <span className="brand-mark flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-[15px] font-black text-white">
              C
            </span>
            <div className="min-w-0">
              <h1 className="truncate text-[13.5px] font-bold tracking-tight text-(--ink)">
                CareerUS Solutions
              </h1>
              <p className="mt-0.5 text-[9.5px] font-semibold uppercase tracking-[0.2em] text-muted">
                Compliance CRM
              </p>
            </div>
          </div>
          <button
            type="button"
            className="glass-chip inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
            onClick={close}
            aria-label="Close menu"
            title="Close menu"
          >
            <X className="h-4 w-4" strokeWidth={2} />
          </button>
        </div>

        <div
          ref={listRef}
          className="nav-list relative min-h-0 flex-1 overflow-y-auto overscroll-contain px-2.5 py-3"
        >
          <span ref={capsuleRef} className="nav-capsule" aria-hidden />
          {navItems.map((item, i) => {
            const active = currentView === item.view;
            return (
              <button
                key={item.view}
                type="button"
                onClick={() => go(item.view)}
                title={item.label}
                style={{ "--i": i } as React.CSSProperties}
                className={`nav-item mb-1 flex w-full items-center gap-3 px-2.5 py-2.5 text-left text-[13px] font-medium leading-tight md:py-2 ${
                  active ? "is-active font-semibold" : "text-muted hover:text-foreground"
                }`}
              >
                <span
                  className={`nav-icon flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] ${
                    active ? "" : "bg-secondary"
                  }`}
                >
                  {item.icon}
                </span>
                <span className="min-w-0 flex-1">{item.label}</span>
                {item.view === "daily" && overdueFollowups > 0 && (
                  <span className="inline-flex min-w-5 shrink-0 items-center justify-center rounded-full bg-danger px-1.5 py-0.5 text-[10px] font-black text-white shadow-[0_4px_10px_-2px_rgba(224,74,90,0.6)]">
                    {overdueFollowups}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <div className="shrink-0 border-t border-border px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] text-[10px] leading-relaxed text-muted">
          <div className="font-semibold text-(--ink-2)">v3.30 Priority Master</div>
          <div>MongoDB Mode · DB: {dbSizeKb} KB</div>
        </div>
      </nav>
    </>
  );
}
