"use client";

import { useRouter } from "next/navigation";
import {
  CircleAlert,
  CircleCheck,
  Download,
  Loader2,
  LogOut,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Redo2,
  Save,
  Sparkles,
  Undo2,
  Upload,
} from "lucide-react";
import { useAuth } from "./AuthProvider";
import { useCrm } from "./CrmProvider";
import { clearCrmCache } from "@/lib/crm-cache";
import { HeaderSearch } from "./HeaderSearch";
import { TaskButton } from "./TaskCenter";
import type { SyncStatus } from "@/lib/crm/sync-engine";

function SaveButton({
  status,
  disabled,
  verifying,
  onClick,
}: {
  status: SyncStatus;
  disabled: boolean;
  verifying: boolean;
  onClick: () => void;
}) {
  const saving = status.phase === "saving";
  const failing = status.phase === "retrying" || status.phase === "auth";
  const unsaved = status.phase === "dirty" || saving || failing;
  const total = status.done + status.pending;
  const pct = total > 0 ? Math.round((status.done / total) * 100) : 0;
  const label = verifying && !saving
    ? "Verifying database…"
    : saving
    ? `Saving… ${pct}%`
    : failing
      ? `Retry save (${status.pending})`
      : status.phase === "dirty"
        ? `Save (${status.pending})`
        : "Saved";
  const labelIcon =
    verifying || saving ? (
      <Loader2 className="h-3.5 w-3.5 animate-spin" />
    ) : failing ? (
      <CircleAlert className="h-3.5 w-3.5" />
    ) : status.phase === "dirty" ? (
      <Save className="h-3.5 w-3.5" />
    ) : (
      <CircleCheck className="h-3.5 w-3.5 text-success" />
    );
  const tone = failing ? "is-danger" : unsaved ? "is-warn" : "";
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      title={
        status.error ||
        (unsaved
          ? "Save local changes to the database now (Ctrl+S)"
          : "Everything is saved to the database")
      }
      className={`glass-chip relative inline-flex h-9 shrink-0 items-center justify-center gap-1.5 overflow-hidden whitespace-nowrap rounded-xl border px-3 text-xs font-semibold sm:h-8 ${tone}`}
    >
      {saving && (
        <span
          aria-hidden
          className="absolute inset-y-0 left-0 bg-primary/20 transition-[width] duration-300"
          style={{ width: `${pct}%` }}
        />
      )}
      <span className="relative inline-flex items-center gap-1.5">
        {labelIcon}
        {label}
      </span>
    </button>
  );
}

export function TopBar({
  onExport,
  onImport,
  onSmartAssist,
}: {
  onExport: () => void;
  onImport: () => void;
  onSmartAssist: () => void;
}) {
  const router = useRouter();
  const { logoutLocal } = useAuth();
  const {
    sidebarCollapsed,
    toggleSidebar,
    undo,
    redo,
    showAddModal,
    ready,
    syncStatus,
    flushSave,
    saveAndVerify,
    verifying,
    hasUnsavedWork,
    commitActiveEdit,
    toast,
  } = useCrm();

  const logout = async () => {
    // Commit any half-typed cell, then try to finish saving before leaving.
    commitActiveEdit();
    await new Promise((r) => setTimeout(r, 0));
    if (hasUnsavedWork()) {
      toast("Saving your changes before logout…", "info");
      const saved = await Promise.race([
        flushSave(),
        new Promise<boolean>((r) => setTimeout(() => r(false), 15000)),
      ]);
      if (!saved || hasUnsavedWork()) {
        const leave = confirm(
          "Some of your data is NOT saved to the database yet.\n\n" +
            "A copy is kept on this device and will be restored (and saved) the next time you sign in on this browser - but until then it is not in the database.\n\n" +
            "Do you still want to log out?"
        );
        if (!leave) return;
      }
    }
    await fetch("/api/auth/logout", { method: "POST" });
    logoutLocal();
    clearCrmCache();
    router.replace("/login");
    router.refresh();
  };

  const btn =
    "glass-chip inline-flex h-9 shrink-0 sm:h-8 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl px-3 text-xs font-semibold";
  const ico = "h-3.5 w-3.5";

  return (
    <header className="crm-topbar shrink-0 border-b border-border bg-card">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 px-3 py-2 pl-[max(0.75rem,env(safe-area-inset-left))] pr-[max(0.75rem,env(safe-area-inset-right))] md:flex-nowrap md:px-4">
        <button
          type="button"
          className={btn}
          onClick={toggleSidebar}
          title="Toggle navigation menu"
          aria-label="Toggle navigation menu"
          aria-expanded={!sidebarCollapsed}
        >
          <span aria-hidden>
            {sidebarCollapsed ? (
              <PanelLeftOpen className={ico} />
            ) : (
              <PanelLeftClose className={ico} />
            )}
          </span>
          <span className="max-sm:sr-only">
            {sidebarCollapsed ? "Show Menu" : "Hide Menu"}
          </span>
        </button>

        <HeaderSearch />

        {/* Full labels kept — scroll horizontally when space is tight */}
        <div className="order-last -mx-3 flex w-[calc(100%+1.5rem)] shrink-0 items-center px-3 md:order-none md:mx-0 md:w-auto md:px-0 gap-1.5 overflow-x-auto overscroll-x-contain pb-0.5 [-ms-overflow-style:none] scrollbar-none md:max-w-[55%] lg:max-w-none [&::-webkit-scrollbar]:hidden">
          <TaskButton className={btn} />
          <button
            type="button"
            className={`${btn} ${!ready ? "opacity-60" : ""}`}
            onClick={onSmartAssist}
          >
            <Sparkles className={ico} />
            Smart
          </button>
          <button
            type="button"
            className={`${btn} ${!ready ? "opacity-60" : ""}`}
            disabled={!ready}
            onClick={undo}
          >
            <Undo2 className={ico} />
            Undo
          </button>
          <button
            type="button"
            className={`${btn} ${!ready ? "opacity-60" : ""}`}
            disabled={!ready}
            onClick={redo}
          >
            <Redo2 className={ico} />
            Redo
          </button>
          <button
            type="button"
            disabled={!ready}
            className="glass-chip is-primary inline-flex h-9 shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl sm:h-8 px-3.5 text-xs font-semibold"
            onClick={showAddModal}
          >
            <Plus className={ico} strokeWidth={2.4} />
            Add Candidate
          </button>
          <button
            type="button"
            className={`${btn} ${!ready ? "opacity-60" : ""}`}
            onClick={onExport}
          >
            <Upload className={ico} />
            Export
          </button>
          <button
            type="button"
            className={`${btn} ${!ready ? "opacity-60" : ""}`}
            onClick={onImport}
          >
            <Download className={ico} />
            Import
          </button>
          <SaveButton
            status={syncStatus}
            disabled={!ready}
            verifying={verifying}
            onClick={() => void saveAndVerify()}
          />
          <button
            type="button"
            className={`${btn} is-danger`}
            onClick={() => void logout()}
          >
            <LogOut className={ico} />
            Logout
          </button>
        </div>
      </div>
    </header>
  );
}
