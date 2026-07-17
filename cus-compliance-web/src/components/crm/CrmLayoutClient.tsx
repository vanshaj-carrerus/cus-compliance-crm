"use client";

import { useRouter, usePathname } from "next/navigation";
import { CrmProvider } from "./CrmProvider";
import { CrmBootEffects } from "./CrmBootEffects";
import { CrmShell } from "./CrmShell";
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
];

function viewFromPath(pathname: string): CrmView {
  const segment = pathname.replace(/^\//, "").split("/")[0] || "dashboard";
  return ALLOWED.includes(segment as CrmView)
    ? (segment as CrmView)
    : "dashboard";
}

export function CrmLayoutClient({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const routeView = viewFromPath(pathname);

  return (
    <CrmProvider
      initialView={routeView}
      routeView={routeView}
      onNavigate={(view) => router.push("/" + view)}
    >
      <CrmBootEffects />
      <CrmShell />
      {children}
    </CrmProvider>
  );
}
