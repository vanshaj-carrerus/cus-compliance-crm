import type { CrmView } from "@/lib/crm/types";

export function Skeleton({
  className = "",
}: {
  className?: string;
}) {
  return (
    <div
      className={`animate-pulse rounded-md bg-secondary/80 ${className}`}
      aria-hidden
    />
  );
}

export function StatCardSkeleton() {
  return (
    <div className="relative overflow-hidden rounded-[var(--radius)] border border-border bg-card p-4 shadow-sm sm:p-5">
      <div className="absolute inset-x-0 top-0 h-[3px] bg-border" />
      <Skeleton className="mb-3 h-3 w-24" />
      <Skeleton className="h-8 w-28" />
      <Skeleton className="mt-2 h-3 w-36" />
    </div>
  );
}

export function TableSkeleton({ rows = 8 }: { rows?: number }) {
  return (
    <div className="overflow-hidden rounded-[var(--radius)] border border-border bg-card">
      <div className="border-b border-border bg-secondary/40 px-4 py-3">
        <Skeleton className="h-4 w-40" />
      </div>
      <div className="divide-y divide-border">
        {Array.from({ length: rows }).map((_, i) => (
          <div
            key={i}
            className="flex items-center gap-3 px-4 py-3"
          >
            <Skeleton className="h-4 w-8 shrink-0" />
            <Skeleton className="h-4 flex-1" />
            <Skeleton className="hidden h-4 w-24 sm:block" />
            <Skeleton className="hidden h-4 w-20 md:block" />
            <Skeleton className="h-4 w-16 shrink-0" />
          </div>
        ))}
      </div>
    </div>
  );
}

/** Page chrome + placeholders matching the active view shape. */
export function ViewDataSkeleton({ view }: { view: CrmView }) {
  const isDashboard = view === "dashboard" || view === "reports";
  const isAdmin = view === "admin";
  const isFormmy = view === "workflows" || view === "backup";

  return (
    <div className="mx-auto w-full" aria-busy="true" aria-live="polite">
      <div className="mb-4 flex flex-col gap-2 sm:mb-5 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-2">
          <Skeleton className="h-3 w-28" />
          <Skeleton className="h-7 w-48 sm:w-64" />
          <Skeleton className="h-3 w-full max-w-md" />
        </div>
        <Skeleton className="h-8 w-36 rounded-full" />
      </div>

      <p className="mb-4 text-xs text-muted sm:mb-5">
        Loading your data… large workspaces can take a moment.
      </p>

      {isDashboard && (
        <div className="mb-5 grid grid-cols-1 gap-3 sm:mb-6 sm:grid-cols-2 sm:gap-4 xl:grid-cols-3 2xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <StatCardSkeleton key={i} />
          ))}
        </div>
      )}

      {isAdmin && (
        <div className="space-y-4">
          <div className="rounded-[var(--radius)] border border-border bg-card p-4">
            <Skeleton className="mb-3 h-4 w-40" />
            <div className="grid gap-2 sm:grid-cols-3">
              <Skeleton className="h-10" />
              <Skeleton className="h-10" />
              <Skeleton className="h-10" />
            </div>
          </div>
          <TableSkeleton rows={5} />
        </div>
      )}

      {isFormmy && (
        <div className="space-y-3 rounded-[var(--radius)] border border-border bg-card p-4 sm:p-5">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      )}

      {!isDashboard && !isAdmin && !isFormmy && <TableSkeleton rows={10} />}
    </div>
  );
}

/** Lightweight full-app chrome while auth resolves. */
export function AppShellSkeleton() {
  return (
    <div className="relative flex h-screen overflow-hidden bg-background">
      <div className="hidden w-[240px] shrink-0 border-r border-border bg-sidebar p-3 md:block">
        <Skeleton className="mb-4 h-8 w-40" />
        <div className="space-y-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-9 w-full" />
          ))}
        </div>
      </div>
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center gap-2 border-b border-border bg-card px-3 py-2 md:px-4">
          <Skeleton className="h-8 w-28" />
          <Skeleton className="h-8 flex-1" />
          <Skeleton className="h-8 w-20" />
          <Skeleton className="h-8 w-20" />
        </div>
        <div className="flex-1 overflow-auto p-3 sm:p-4 md:p-6">
          <ViewDataSkeleton view="dashboard" />
        </div>
      </div>
    </div>
  );
}
