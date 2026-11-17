/**
 * Local-first safety net. Everything here lives in localStorage and is
 * written SYNCHRONOUSLY, so what the user typed survives a refresh, crash or
 * logout until MongoDB has confirmed it.
 *
 * Every browser tab writes ONLY its own keys (suffix = TAB_ID). A second tab
 * therefore can never erase (or overwrite) the unsaved work of the first one.
 * A tab that dies (closed / crashed / refreshed) stops beating its heartbeat;
 * any live tab then adopts its leftovers (see orphanKeys) and saves them.
 */

export const TAB_ID: string =
  Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

export type CellDraft = { id: number; field: string; value: string; ts: number };
export type FormDraft = { editingId: number | null; form: unknown; ts: number };

const HEARTBEAT_STALE_MS = 7000;

const hbKey = (u: string, tab = TAB_ID) => `crm-tab:v1:${u}:${tab}`;
export const journalKeyFor = (u: string, tab = TAB_ID) => `crm-unsynced:v1:${u}:${tab}`;
const cellKey = (u: string, tab = TAB_ID) => `crm-cell-drafts:v1:${u}:${tab}`;
const formKey = (u: string, tab = TAB_ID) => `crm-form-draft:v1:${u}:${tab}`;

export function beat(user: string) {
  try {
    localStorage.setItem(hbKey(user), String(Date.now()));
  } catch {
    /* ignore */
  }
}

/** Called on pagehide so a refreshed page can adopt this tab's leftovers at once. */
export function markTabDead(user: string) {
  try {
    localStorage.setItem(hbKey(user), "0");
  } catch {
    /* ignore */
  }
}

function tabIsDead(user: string, tab: string): boolean {
  if (tab === TAB_ID) return false;
  try {
    const hb = Number(localStorage.getItem(hbKey(user, tab)) || 0);
    return !hb || Date.now() - hb > HEARTBEAT_STALE_MS;
  } catch {
    return false;
  }
}

/**
 * Keys under `prefix + user + ":"` that belong to OTHER tabs which are no
 * longer alive. A legacy key without a tab suffix counts as an orphan too.
 */
export function orphanKeys(prefix: string, user: string): string[] {
  const out: string[] = [];
  try {
    const base = `${prefix}${user}`;
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k || !k.startsWith(base)) continue;
      const rest = k.slice(base.length);
      if (rest === "") {
        out.push(k); // legacy single-key format
      } else if (rest.startsWith(":")) {
        const tab = rest.slice(1);
        if (tab && tabIsDead(user, tab)) out.push(k);
      }
    }
  } catch {
    /* ignore */
  }
  return out;
}

export const JOURNAL_PREFIX = "crm-unsynced:v1:";
export const CELL_PREFIX = "crm-cell-drafts:v1:";
export const FORM_PREFIX = "crm-form-draft:v1:";

/** Candidate fields a sheet cell is allowed to restore into. */
const RESTORABLE = new Set([
  "name",
  "phoneNumber",
  "floor",
  "po",
  "poMonth",
  "startDate",
  "annualPackage",
  "serviceFeePercent",
  "totalServiceFee",
  "remarks",
  "expectedDate",
  "expectedAmount",
  "monthRemarks",
  "lastContactDate",
]);

export function isRestorableField(field: string): boolean {
  return RESTORABLE.has(field) || /^inst\d+$/.test(field);
}

function readJson<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export function writeCellDrafts(user: string, drafts: Record<string, CellDraft>) {
  try {
    if (Object.keys(drafts).length) {
      localStorage.setItem(cellKey(user), JSON.stringify(drafts));
    } else {
      localStorage.removeItem(cellKey(user));
    }
    return true;
  } catch {
    return false;
  }
}

/** Cell drafts left behind by dead tabs: returns them plus the keys to release. */
export function takeOrphanCellDrafts(user: string): { drafts: CellDraft[]; keys: string[] } {
  const keys = orphanKeys(CELL_PREFIX, user);
  const drafts: CellDraft[] = [];
  for (const k of keys) {
    const m = readJson<Record<string, CellDraft>>(k) || {};
    for (const d of Object.values(m)) {
      if (d && isRestorableField(d.field)) drafts.push(d);
    }
  }
  drafts.sort((a, b) => a.ts - b.ts);
  return { drafts, keys };
}

export function readFormDraft(user: string): FormDraft | null {
  return readJson<FormDraft>(formKey(user));
}

export function writeFormDraft(user: string, draft: FormDraft | null) {
  try {
    if (draft) localStorage.setItem(formKey(user), JSON.stringify(draft));
    else localStorage.removeItem(formKey(user));
  } catch {
    /* storage blocked/full - nothing more we can do here */
  }
}

/** Moves a dead tab's unsaved candidate form into this tab's own slot. */
export function adoptOrphanFormDraft(user: string): FormDraft | null {
  const keys = orphanKeys(FORM_PREFIX, user);
  let best: FormDraft | null = null;
  for (const k of keys) {
    const d = readJson<FormDraft>(k);
    if (d && (!best || d.ts > best.ts)) best = d;
  }
  if (best && !readFormDraft(user)) writeFormDraft(user, best);
  for (const k of keys) {
    try {
      localStorage.removeItem(k);
    } catch {
      /* ignore */
    }
  }
  return readFormDraft(user);
}

export function releaseKeys(keys: string[]) {
  for (const k of keys) {
    try {
      localStorage.removeItem(k);
    } catch {
      /* ignore */
    }
  }
}
