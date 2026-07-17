import { useState } from "react";
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

export function CrmLayoutClient() {
  const [view, setView] = useState<CrmView>("dashboard");

  return (
    <CrmProvider
      initialView={view}
      routeView={view}
      onNavigate={(next) => {
        if (ALLOWED.includes(next)) setView(next);
      }}
    >
      <CrmBootEffects />
      <CrmShell />
    </CrmProvider>
  );
}
