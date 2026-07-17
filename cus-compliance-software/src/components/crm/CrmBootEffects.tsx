"use client";

import { useEffect, useState } from "react";
import { useCrm } from "./CrmProvider";
import { DailyDigestModal } from "./modals/DailyDigestModal";
import { todayIso, wasBackedUpToday } from "@/lib/crm";

let digestDone = false;
let backupDone = false;

/** Runs once while CrmProvider is mounted (survives route changes). */
export function CrmBootEffects() {
  const { ready, settings, toast } = useCrm();
  const [digestOpen, setDigestOpen] = useState(false);

  useEffect(() => {
    if (!ready || digestDone) return;
    const t = todayIso();
    const hour = new Date().getHours();
    if (hour < 9 || settings.lastDigestRead === t) {
      digestDone = true;
      return;
    }
    const timer = setTimeout(() => {
      digestDone = true;
      setDigestOpen(true);
    }, 1800);
    return () => clearTimeout(timer);
  }, [ready, settings.lastDigestRead]);

  useEffect(() => {
    if (!ready || backupDone) return;
    const timer = setTimeout(() => {
      backupDone = true;
      if (!wasBackedUpToday()) {
        toast(
          "Daily backup reminder: download today's backup before closing.",
          "info"
        );
      }
    }, 2500);
    return () => clearTimeout(timer);
  }, [ready, toast]);

  return (
    <DailyDigestModal open={digestOpen} onClose={() => setDigestOpen(false)} />
  );
}
