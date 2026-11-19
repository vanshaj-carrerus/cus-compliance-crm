import { loadSessionUser } from "@/lib/session-user";
import { CandidateModel } from "@/lib/models/Candidate";
import { isComplianceAdmin } from "@/lib/roles";

/**
 * Permanent data scope for the signed-in user.
 * - Compliance Admin: unrestricted (sees every candidate).
 * - Anyone else with CRM access (Compliance User): only candidates whose
 *   "Assigned To" is them. This is enforced here on the server, so it can't
 *   be undone from the browser.
 */
export type CandidateScope =
  | { restricted: false }
  | {
      restricted: true;
      /** Name stored in "Assigned To" for new records. */
      primary: string;
      /** Every spelling that counts as "me" (display name, email prefix). */
      names: string[];
      /** Mongo filter matching only this user's candidates. */
      filter: Record<string, unknown>;
      /** True when a candidate's assignedTo is this user. */
      owns: (assignedTo: unknown) => boolean;
    };

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const norm = (s: unknown) => String(s ?? "").trim().toLowerCase();

export async function getCandidateScope(req: Request): Promise<CandidateScope | null> {
  const auth = await loadSessionUser(req);
  if (!auth) return null; // not signed in
  if (isComplianceAdmin(auth.user.role)) return { restricted: false };

  const prefix = auth.user.email.split("@")[0];
  const primary = (auth.user.name || prefix).trim();
  const names = [...new Set([primary, prefix].map((n) => n.trim()).filter(Boolean))];
  const lower = new Set(names.map(norm));
  const re = new RegExp(`^\\s*(${names.map(escapeRe).join("|")})\\s*$`, "i");
  return {
    restricted: true,
    primary,
    names,
    filter: { assignedTo: { $regex: re } },
    owns: (a) => lower.has(norm(a)),
  };
}

/** Of `ids`, the ones that already exist AND belong to someone else. */
export async function foreignCandidateIds(
  scope: Extract<CandidateScope, { restricted: true }>,
  ids: number[]
): Promise<Set<number>> {
  if (!ids.length) return new Set();
  const docs = await CandidateModel.find(
    { id: { $in: ids } },
    { id: 1, assignedTo: 1, _id: 0 }
  ).lean();
  return new Set(
    (docs as { id: number; assignedTo?: string }[])
      .filter((d) => !scope.owns(d.assignedTo))
      .map((d) => d.id)
  );
}

/** ids of the user's own candidates (for scoping payment history). */
export async function ownCandidateIds(
  scope: Extract<CandidateScope, { restricted: true }>
): Promise<number[]> {
  const docs = await CandidateModel.find(scope.filter, { id: 1, _id: 0 }).lean();
  return (docs as { id: number }[]).map((d) => d.id);
}

// ── Shared settings document ────────────────────────────────────────────
// Settings are one document for everyone, but the workflow log/state hold
// candidate names and ids. A scoped user may only see - and only change -
// the entries that belong to their own candidates.

type SettingsLike = object & {
  workflowLog?: { candidateId?: unknown }[];
  workflowState?: Record<string, string>;
};

const stateKeyId = (k: string) => k.slice(k.lastIndexOf(":") + 1);

/** What a scoped user is allowed to read of the settings. */
export function scopeSettings<T extends SettingsLike>(settings: T, own: Set<string>): T {
  const log = (settings.workflowLog || []).filter((e) => own.has(String(e.candidateId)));
  const state = Object.fromEntries(
    Object.entries(settings.workflowState || {}).filter(([k]) => own.has(stateKeyId(k)))
  );
  return { ...settings, workflowLog: log, workflowState: state };
}

/**
 * Settings a scoped user submitted, merged over the stored copy: everything
 * they can't see (other users' log/state) is carried over untouched.
 */
export function mergeScopedSettings<T extends SettingsLike>(
  existing: T,
  incoming: T,
  own: Set<string>
): T {
  const log = [
    ...(existing.workflowLog || []).filter((e) => !own.has(String(e.candidateId))),
    ...(incoming.workflowLog || []).filter((e) => own.has(String(e.candidateId))),
  ];
  const state: Record<string, string> = {};
  for (const [k, v] of Object.entries(existing.workflowState || {}))
    if (!own.has(stateKeyId(k))) state[k] = v;
  for (const [k, v] of Object.entries(incoming.workflowState || {}))
    if (own.has(stateKeyId(k))) state[k] = v;
  return { ...incoming, workflowLog: log, workflowState: state };
}

export async function ownIdSet(
  scope: Extract<CandidateScope, { restricted: true }>
): Promise<Set<string>> {
  return new Set((await ownCandidateIds(scope)).map(String));
}
