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

/** Fetch CRM snapshot once; reuse on remounts within the same tab. */
export async function ensureCrmBootstrap(): Promise<CrmBootstrap> {
  if (crmCache) return crmCache;
  if (crmInflight) return crmInflight;

  crmInflight = (async () => {
    const [cRes, hRes, sRes] = await Promise.all([
      fetch("/api/candidates"),
      fetch("/api/history"),
      fetch("/api/settings"),
    ]);
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
