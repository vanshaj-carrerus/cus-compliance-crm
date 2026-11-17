"use client";

import { useRouter } from "next/navigation";
import { useAuth } from "./AuthProvider";
import { useCrm } from "./CrmProvider";
import { clearCrmCache } from "@/lib/crm-cache";
import { todayIso, statusExcluded } from "@/lib/crm";
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
      ? `⚠ Retry save (${status.pending})`
      : status.phase === "dirty"
        ? `💾 Save (${status.pending})`
        : "✓ Saved";
  const tone = failing
    ? "border-danger/40 text-danger bg-danger/5"
    : unsaved
      ? "border-warning/50 text-foreground bg-warning/10"
      : "border-border text-muted bg-secondary";
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
      className={`relative inline-flex h-9 shrink-0 items-center justify-center gap-1.5 overflow-hidden whitespace-nowrap rounded-[var(--radius)] border px-2.5 text-xs font-semibold sm:h-8 ${tone}`}
    >
      {saving && (
        <span
          aria-hidden
          className="absolute inset-y-0 left-0 bg-primary/20 transition-[width] duration-300"
          style={{ width: `${pct}%` }}
        />
      )}
      <span className="relative">{label}</span>
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
    searchQuery,
    setSearchQuery,
    sidebarCollapsed,
    toggleSidebar,
    undo,
    redo,
    showAddModal,
    candidates,
    setDailyCategory,
    navigate,
    ready,
    syncStatus,
    flushSave,
    saveAndVerify,
    verifying,
    hasUnsavedWork,
    commitActiveEdit,
    toast,
  } = useCrm();

  const overdueFollowups = ready
    ? candidates.filter(
        (c) =>
          c.nextFollowUpDate &&
          c.nextFollowUpDate < todayIso() &&
          !statusExcluded(c.status)
      ).length
    : 0;

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
    "inline-flex h-9 shrink-0 sm:h-8 items-center justify-center gap-1.5 whitespace-nowrap rounded-[var(--radius)] border border-border bg-secondary px-2.5 text-xs font-medium text-foreground hover:bg-border";

  return (
    <header className="shrink-0 border-b border-border bg-card">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 px-3 py-2 pl-[max(0.75rem,env(safe-area-inset-left))] pr-[max(0.75rem,env(safe-area-inset-right))] md:flex-nowrap md:px-4">
        <button
          type="button"
          className={btn}
          onClick={toggleSidebar}
          title="Toggle navigation menu"
          aria-label="Toggle navigation menu"
          aria-expanded={!sidebarCollapsed}
        >
          <span aria-hidden>{sidebarCollapsed ? "☰" : "◀"}</span>
          <span className="max-sm:sr-only">
            {sidebarCollapsed ? "Show Menu" : "Hide Menu"}
          </span>
        </button>

        <div className="relative min-w-0 flex-1">
          <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-sm opacity-60">
            🔍
          </span>
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search candidates, PO, floor, status..."
            className="h-9 w-full rounded-(--radius) border border-border bg-input py-1.5 pl-9 pr-3 text-sm text-foreground outline-none focus:border-primary sm:h-auto"
            aria-label="Search candidates"
          />
        </div>

        {/* Full labels kept — scroll horizontally when space is tight */}
        <div className="order-last -mx-3 flex w-[calc(100%+1.5rem)] shrink-0 items-center px-3 md:order-none md:mx-0 md:w-auto md:px-0 gap-1.5 overflow-x-auto overscroll-x-contain pb-0.5 [-ms-overflow-style:none] scrollbar-none md:max-w-[55%] lg:max-w-none [&::-webkit-scrollbar]:hidden">
          <button
            type="button"
            className={`${btn} rounded-full ${!ready ? "opacity-60" : ""}`}
            onClick={() => {
              setDailyCategory("followupsOverdue");
              navigate("daily");
            }}
          >
            <span className="h-2 w-2 rounded-full bg-success shadow-[0_0_10px_rgba(34,197,94,.55)]" />
            Follow-ups
            {overdueFollowups > 0 && (
              <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-black text-white">
                {overdueFollowups}
              </span>
            )}
          </button>
          <button
            type="button"
            className={`${btn} ${!ready ? "opacity-60" : ""}`}
            onClick={onSmartAssist}
          >
            ✨ Smart
          </button>
          <button
            type="button"
            className={`${btn} ${!ready ? "opacity-60" : ""}`}
            disabled={!ready}
            onClick={undo}
          >
            ↩️ Undo
          </button>
          <button
            type="button"
            className={`${btn} ${!ready ? "opacity-60" : ""}`}
            disabled={!ready}
            onClick={redo}
          >
            ↪️ Redo
          </button>
          <button
            type="button"
            disabled={!ready}
            className="inline-flex h-9 shrink-0 items-center justify-center whitespace-nowrap rounded-(--radius) bg-primary sm:h-8 px-2.5 text-xs font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-60"
            onClick={showAddModal}
          >
            + Add Candidate
          </button>
          <button
            type="button"
            className={`${btn} ${!ready ? "opacity-60" : ""}`}
            onClick={onExport}
          >
            📤 Export
          </button>
          <button
            type="button"
            className={`${btn} ${!ready ? "opacity-60" : ""}`}
            onClick={onImport}
          >
            📥 Import
          </button>
          <SaveButton
            status={syncStatus}
            disabled={!ready}
            verifying={verifying}
            onClick={() => void saveAndVerify()}
          />
          <button
            type="button"
            className={`${btn} border-danger/30 text-danger hover:bg-danger/5`}
            onClick={() => void logout()}
          >
            Logout
          </button>
        </div>
      </div>
    </header>
  );
}
