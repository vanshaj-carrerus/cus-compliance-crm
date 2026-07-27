"use client";

import { useCallback } from "react";
import { usePathname } from "next/navigation";
import { AuthProvider, useAuth } from "./AuthProvider";
import { CrmProvider } from "./CrmProvider";
import { CrmBootEffects } from "./CrmBootEffects";
import { CrmShell } from "./CrmShell";
import { NoAccessScreen } from "./NoAccessScreen";
import { AppShellSkeleton } from "./Skeleton";
import type { CrmView } from "@/lib/crm/types";

const ALLOWED: CrmView[] = [
  "dashboard",
  "daily",
  "master",
  "compliance",
  "target",
  "incentive",
  "history",
  "reports",
  "workflows",
  "backup",
  "admin",
];

function viewFromPath(pathname: string): CrmView {
  const segment = pathname.replace(/^\//, "").split("/")[0] || "dashboard";
  return ALLOWED.includes(segment as CrmView)
    ? (segment as CrmView)
    : "dashboard";
}

function AuthGate({ children }: { children: React.ReactNode }) {
  const { ready, hasCrmAccess } = useAuth();

  if (!ready) {
    return <AppShellSkeleton />;
  }

  if (!hasCrmAccess) {
    return <NoAccessScreen />;
  }

  return <>{children}</>;
}

/**
 * Client-side view switch — updates the URL without a Next.js navigation
 * (avoids middleware + RSC round-trips on every sidebar click).
 */
function pushCrmView(view: CrmView) {
  if (typeof window === "undefined") return;
  const path = "/" + view;
  if (window.location.pathname === path) return;
  window.history.pushState({ crmView: view }, "", path);
}

export function CrmLayoutClient({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const routeView = viewFromPath(pathname);
  const onNavigate = useCallback((view: CrmView) => {
    pushCrmView(view);
  }, []);

  return (
    <AuthProvider>
      <AuthGate>
        <CrmProvider
          initialView={routeView}
          routeView={routeView}
          onNavigate={onNavigate}
        >
          <CrmBootEffects />
          <CrmShell />
          {children}
        </CrmProvider>
      </AuthGate>
    </AuthProvider>
  );
}
