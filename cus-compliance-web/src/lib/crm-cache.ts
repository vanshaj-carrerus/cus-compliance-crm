import type { Candidate, CrmSettings, PaymentHistory } from "@/lib/crm/types";
import { normalizeCandidate, mergeSettings, defaultSettings } from "@/lib/crm/normalize";

export type CrmBootstrap = {
  candidates: Candidate[];
  history: PaymentHistory[];
  settings: CrmSettings;
};

let crmCache: CrmBootstrap | null = null;
let crmInflight: Promise<CrmBootstrap> | null = null;

export function peekCrmCache(): CrmBootstrap | null {
  return crmCache;
}

export function setCrmCache(data: CrmBootstrap) {
  crmCache = data;
}

export function clearCrmCache() {
  crmCache = null;
  crmInflight = null;
}

/** Always hits MongoDB (never the module cache) - used to verify saves. */
export async function fetchCrmSnapshot(): Promise<CrmBootstrap> {
  const [cRes, hRes, sRes] = await Promise.all([
    fetch("/api/candidates?verify=1", { cache: "no-store" }),
    fetch("/api/history", { cache: "no-store" }),
    fetch("/api/settings", { cache: "no-store" }),
  ]);
  if (!cRes.ok || !hRes.ok || !sRes.ok) {
    throw new Error("Could not read the database to verify");
  }
  const cData = await cRes.json();
  const hData = await hRes.json();
  const sData = await sRes.json();
  return {
    candidates: (cData.candidates || []).map((x: Candidate) =>
      normalizeCandidate(x)
    ),
    history: hData.history || [],
    settings: mergeSettings(sData.settings ?? defaultSettings()),
  };
}

/** Fetch CRM snapshot once; reuse on remounts within the same tab. */
export async function ensureCrmBootstrap(): Promise<CrmBootstrap> {
  if (crmCache) return crmCache;
  if (crmInflight) return crmInflight;

  crmInflight = (async () => {
    const [cRes, hRes, sRes] = await Promise.all([
      fetch("/api/candidates", { cache: "no-store" }),
      fetch("/api/history", { cache: "no-store" }),
      fetch("/api/settings", { cache: "no-store" }),
    ]);
    if (cRes.status === 401 || hRes.status === 401 || sRes.status === 401) {
      // The session cookie is signed fine (so /api/auth/me says "signed in")
      // but its user no longer exists in this database. Drop the stale
      // cookie - otherwise /login would bounce straight back to /dashboard.
      await fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
      clearCrmCache();
      if (typeof window !== "undefined") window.location.replace("/login");
      throw new Error("Session expired - please sign in again");
    }
    if (!cRes.ok || !hRes.ok || !sRes.ok) {
      throw new Error("Failed to load CRM data from MongoDB");
    }
    const cData = await cRes.json();
    const hData = await hRes.json();
    const sData = await sRes.json();
    const data: CrmBootstrap = {
      candidates: (cData.candidates || []).map((x: Candidate) =>
        normalizeCandidate(x)
      ),
      history: hData.history || [],
      settings: mergeSettings(sData.settings ?? defaultSettings()),
    };
    crmCache = data;
    return data;
  })();

  try {
    return await crmInflight;
  } finally {
    crmInflight = null;
  }
}
