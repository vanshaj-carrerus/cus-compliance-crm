import { useCrm } from "./CrmProvider";
import { todayIso, statusExcluded } from "@/lib/crm";
import { useAuth } from "@/lib/auth";

export function TopBar({
  onExport,
  onImport,
  onSmartAssist,
}: {
  onExport: () => void;
  onImport: () => void;
  onSmartAssist: () => void;
}) {
  const { logout } = useAuth();
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
  } = useCrm();

  const overdueFollowups = candidates.filter(
    (c) =>
      c.nextFollowUpDate &&
      c.nextFollowUpDate < todayIso() &&
      !statusExcluded(c.status)
  ).length;

  const btn =
    "inline-flex h-8 shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-[var(--radius)] border border-border bg-secondary px-2.5 text-xs font-medium text-foreground hover:bg-border";

  return (
    <header className="shrink-0 border-b border-border bg-card">
      <div className="flex items-center gap-2 px-3 py-2 md:px-4">
        <button
          type="button"
          className={btn}
          onClick={toggleSidebar}
          title="Toggle navigation menu"
          aria-label="Toggle navigation menu"
          aria-expanded={!sidebarCollapsed}
        >
          {sidebarCollapsed ? "☰ Show Menu" : "◀ Hide Menu"}
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
            className="w-full rounded-[var(--radius)] border border-border bg-input py-1.5 pl-9 pr-3 text-xs text-foreground outline-none focus:border-primary sm:text-sm"
            aria-label="Search candidates"
          />
        </div>

        {/* Full labels kept — scroll horizontally when space is tight */}
        <div className="flex max-w-[55%] shrink-0 items-center gap-1.5 overflow-x-auto overscroll-x-contain pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] sm:max-w-none [&::-webkit-scrollbar]:hidden">
          <button
            type="button"
            className={`${btn} rounded-full`}
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
          <button type="button" className={btn} onClick={onSmartAssist}>
            ✨ Smart
          </button>
          <button type="button" className={btn} onClick={undo}>
            ↩️ Undo
          </button>
          <button type="button" className={btn} onClick={redo}>
            ↪️ Redo
          </button>
          <button
            type="button"
            className="inline-flex h-8 shrink-0 items-center justify-center whitespace-nowrap rounded-[var(--radius)] bg-primary px-2.5 text-xs font-semibold text-primary-foreground hover:opacity-90"
            onClick={showAddModal}
          >
            + Add Candidate
          </button>
          <button type="button" className={btn} onClick={onExport}>
            📤 Export
          </button>
          <button type="button" className={btn} onClick={onImport}>
            📥 Import
          </button>
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
