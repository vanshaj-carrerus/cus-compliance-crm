import type { Candidate, CrmSettings, PaymentHistory } from "./types";
import {
  JOURNAL_PREFIX,
  beat,
  journalKeyFor,
  markTabDead,
  orphanKeys,
  releaseKeys,
} from "./drafts";

/**
 * Delta sync engine - the single place that decides what has to be written
 * to MongoDB, writes it, and makes sure nothing the user typed is lost.
 *
 * Guarantees
 *  1. Nothing is ever "fire and forget": every change stays in `dirty` (and in
 *     a localStorage journal) until MongoDB has confirmed it.
 *  2. Only changed documents are sent (never a full snapshot), in small
 *     batches, one request at a time - friendly to a free Atlas cluster.
 *  3. Failures retry forever with exponential backoff (or immediately on the
 *     "online" event / the Save button). Only an expired session pauses it.
 *  4. The journal is re-applied on the next load, so even a closed tab, a
 *     crash or an expired session can't lose edits.
 */

export type Snapshot = {
  candidates: Candidate[];
  history: PaymentHistory[];
  settings: CrmSettings;
};

export type SyncPhase =
  | "idle" // everything confirmed by MongoDB
  | "dirty" // local changes waiting for the debounce
  | "saving" // request in flight
  | "retrying" // last attempt failed, waiting to retry
  | "auth"; // session expired - paused until the user signs in again

export type SyncStatus = {
  phase: SyncPhase;
  /** Items (candidates + history + deletions + settings) not yet confirmed. */
  pending: number;
  /** Items confirmed during the current save run. */
  done: number;
  lastSavedAt: number | null;
  error: string | null;
  /** epoch ms of the next automatic retry */
  retryAt: number | null;
  /** The browser journal could not be written (storage full/blocked). */
  journalFailed: boolean;
};

export type CellSync = "dirty" | "saving" | "error";

export type ReconcileResult = {
  matched: number;
  resend: number;
  adoptCandidates: Candidate[];
  removeCandidateIds: number[];
  adoptHistory: PaymentHistory[];
  removeHistoryIds: number[];
  adoptSettings: CrmSettings | null;
  /** The snapshot is older than a save that finished meanwhile - discard it. */
  stale?: boolean;
};

type SyncedEntry = { sig: string; fields: Record<string, string> };
/** A field I saved: the value I wrote and the one it replaced. */
type WroteField = { mine: string | undefined; prev: string | undefined };

type Chunk = {
  candidates: Candidate[];
  dirty: Map<number, Set<string>>;
  candidateMeta: Map<number, SyncedEntry>;
  deletedCandidateIds: number[];
  history: PaymentHistory[];
  historySigs: Map<number, string>;
  deletedHistoryIds: number[];
  settings: CrmSettings | null;
  settingsSig: string | null;
};

type Delta = {
  candidates: Candidate[];
  candidateMeta: Map<number, SyncedEntry>;
  /** id -> set of dirty field keys ("*" = whole new candidate) */
  dirtyFields: Map<number, Set<string>>;
  deletedCandidateIds: number[];
  history: PaymentHistory[];
  historySigs: Map<number, string>;
  deletedHistoryIds: number[];
  settings: CrmSettings | null;
  settingsSig: string | null;
};

type Journal = {
  v: 1;
  savedAt: number;
  candidates: Candidate[];
  /** id -> the fields that were edited ("*" = the whole candidate is new). */
  dirty?: Record<string, string[]>;
  deletedCandidateIds: number[];
  history: PaymentHistory[];
  deletedHistoryIds: number[];
  settings: CrmSettings | null;
};

const DEBOUNCE_MS = 800;
const MAX_CANDIDATES_PER_REQUEST = 60;
const MIN_CANDIDATES_PER_REQUEST = 5;
const MAX_HISTORY_PER_REQUEST = 150;
const MAX_DELETES_PER_REQUEST = 400;
const REQUEST_TIMEOUT_MS = 30_000;
const MAX_BACKOFF_MS = 30_000;
const EXIT_BODY_LIMIT = 55_000; // fetch keepalive bodies are capped at 64KB

const IGNORED_FIELDS = new Set(["updatedAt", "_id", "__v"]);

function fieldSigsOf(c: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const k of Object.keys(c)) {
    if (IGNORED_FIELDS.has(k)) continue;
    if (k === "installments" && Array.isArray(c[k])) {
      (c[k] as unknown[]).forEach((inst, i) => {
        out[`installments:${i}`] = JSON.stringify(inst ?? null);
      });
      out["installments:n"] = String((c[k] as unknown[]).length);
      continue;
    }
    out[k] = JSON.stringify(c[k] ?? null);
  }
  return out;
}

function sigFromFields(fields: Record<string, string>): string {
  return Object.keys(fields)
    .sort()
    .map((k) => k + "=" + fields[k])
    .join("\u0001");
}

function entryOf(c: Candidate): SyncedEntry {
  const fields = fieldSigsOf(c as unknown as Record<string, unknown>);
  return { sig: sigFromFields(fields), fields };
}

/**
 * Copy only `keys` (field signatures: top-level names, `installments:i`,
 * `installments:n`) from `source` onto `base`. Everything else in `base`
 * stays exactly as it is - this is what keeps other people's edits intact.
 */
function applyFields(base: Candidate, source: Candidate, keys: Iterable<string>): Candidate {
  const out = { ...(base as unknown as Record<string, unknown>) };
  const src = source as unknown as Record<string, unknown>;
  const set = new Set(keys);
  if (set.has("installments:n")) {
    out.installments = Array.isArray(src.installments) ? [...src.installments] : [];
  } else {
    for (const k of set) {
      const m = /^installments:(\d+)$/.exec(k);
      if (!m) continue;
      const arr = Array.isArray(out.installments) ? [...(out.installments as unknown[])] : [];
      const srcArr = Array.isArray(src.installments) ? (src.installments as unknown[]) : [];
      arr[Number(m[1])] = srcArr[Number(m[1])];
      out.installments = arr;
    }
  }
  for (const k of set) {
    if (k.startsWith("installments:")) continue;
    if (src[k] === undefined) delete out[k];
    else out[k] = src[k];
  }
  return out as unknown as Candidate;
}

/**
 * Three-way merge of ONE candidate. `mine` = what I last knew MongoDB held,
 * `s` = what it holds now, `local` = what is on screen. A field that others
 * changed is taken from the server unless I have an unsaved edit on that very
 * field (then mine stays and is sent next - last save wins).
 */
function mergeCandidate(
  local: Candidate,
  mine: SyncedEntry,
  s: { c: Candidate; e: SyncedEntry },
  wrote?: Map<string, WroteField>
): { candidate: Candidate | null; entry: SyncedEntry; lost: number } {
  if (s.e.sig === mine.sig) return { candidate: null, entry: mine, lost: 0 };
  let lost = 0;
  const localFields = entryOf(local).fields;
  const nextFields = { ...mine.fields };
  const keys = new Set([...Object.keys(s.e.fields), ...Object.keys(mine.fields)]);
  const localDirty = (k: string) => localFields[k] !== mine.fields[k];
  const nDiff = s.e.fields["installments:n"] !== mine.fields["installments:n"];
  const instDirty = [
    ...new Set([...Object.keys(localFields), ...Object.keys(mine.fields)]),
  ].some((k) => k.startsWith("installments:") && localDirty(k));
  const adopt = new Set<string>();
  for (const k of keys) {
    if (s.e.fields[k] === mine.fields[k]) continue;
    const w = wrote?.get(k);
    if (w && s.e.fields[k] === w.prev && s.e.fields[k] !== w.mine) {
      // the server still shows the value from BEFORE my confirmed save: my
      // write did not stick. Keep mine and send that field again.
      lost++;
      if (s.e.fields[k] === undefined) delete nextFields[k];
      else nextFields[k] = s.e.fields[k];
      continue;
    }
    // the list was resized elsewhere while I have unsaved installment edits:
    // leave installments alone until mine are saved
    if (k.startsWith("installments:") && nDiff && instDirty) continue;
    if (s.e.fields[k] === undefined) delete nextFields[k];
    else nextFields[k] = s.e.fields[k];
    if (!localDirty(k)) adopt.add(k);
  }
  return {
    candidate: adopt.size ? applyFields(local, s.c, adopt) : null,
    entry: { fields: nextFields, sig: sigFromFields(nextFields) },
    lost,
  };
}

function genericSig(v: unknown): string {
  const {
    updatedAt: _u,
    _id: _i,
    __v: _v,
    ...rest
  } = (v ?? {}) as Record<string, unknown>;
  void _u;
  void _i;
  void _v;
  return JSON.stringify(rest, Object.keys(rest).sort());
}

/** `inst3` -> `installments:3`; everything else maps to itself. */
export function fieldKeyForColumn(col: string): string {
  const m = /^inst(\d+)$/.exec(col);
  return m ? `installments:${m[1]}` : col;
}

export class SyncEngine {
  private synced = new Map<number, SyncedEntry>();
  private syncedHistory = new Map<number, string>();
  private syncedSettingsSig = "";
  private baseReady = false;
  // What THIS session has written - lets verify() tell "my write was lost"
  // (re-send) apart from "someone else changed it" (adopt their version).
  private touched = new Set<number>();
  private deletedTouched = new Set<number>();
  private touchedHistory = new Set<number>();
  private deletedTouchedHistory = new Set<number>();
  private settingsTouched = false;
  /** Ids whose patch found no document on the server: send them whole. */
  private forceFull = new Set<number>();
  private wrote = new Map<number, Map<string, WroteField>>();
  /** Bumped after every confirmed save (lets a slow GET be recognised as stale). */
  private epoch = 0;
  private heartbeat: ReturnType<typeof setInterval> | null = null;
  getEpoch() {
    return this.epoch;
  }

  private getState: () => Snapshot = () => ({
    candidates: [],
    history: [],
    settings: {} as CrmSettings,
  });

  private dirtyFields = new Map<number, Set<string>>();
  private inflightIds = new Set<number>();
  private inflightFields = new Map<number, Set<string>>();

  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private running: Promise<boolean> | null = null;
  private wake: (() => void) | null = null;
  private disposed = false;
  private chunkSize = MAX_CANDIDATES_PER_REQUEST;
  private runDone = 0;
  private runPendingAtStart = 0;

  status: SyncStatus = {
    phase: "idle",
    pending: 0,
    done: 0,
    lastSavedAt: null,
    error: null,
    retryAt: null,
    journalFailed: false,
  };

  constructor(
    private readonly opts: {
      userKey: string;
      onChange: (status: SyncStatus) => void;
      /** Called when everything is confirmed (cache refresh etc). */
      onIdle?: (snap: Snapshot) => void;
      /** Called when the first unsaved change appears. */
      onDirty?: () => void;
    }
  ) {}

  /** Supplies the live working state (bound once by the provider). */
  bind(getState: () => Snapshot) {
    this.getState = getState;
  }

  // ---------------------------------------------------------------- base --

  /** Declare `snap` as "what MongoDB currently holds". */
  setBase(snap: Snapshot) {
    this.synced.clear();
    this.syncedHistory.clear();
    for (const c of snap.candidates) this.synced.set(c.id, entryOf(c));
    for (const h of snap.history)
      this.syncedHistory.set(h.id, genericSig(h));
    this.syncedSettingsSig = genericSig(snap.settings);
    this.baseReady = true;
    this.dirtyFields.clear();
  }

  // ------------------------------------------------------------- journal --

  private journalKey() {
    return journalKeyFor(this.opts.userKey);
  }

  /**
   * Lay unsaved work left behind by tabs that are no longer alive (plus the
   * pre-refresh copy of this one) over `base`. At boot `base` is the server
   * copy; later it is the live state - ids with unsent local edits there are
   * left alone. Nothing is deleted here: call releaseOrphans(keys) AFTER the
   * adopted changes were re-journaled by markChanged().
   */
  recoverFrom(
    base: Snapshot,
    opts: { protectDirty?: boolean } = {}
  ): { snapshot: Snapshot; count: number; keys: string[] } {
    const keys = orphanKeys(JOURNAL_PREFIX, this.opts.userKey);
    const journals: Journal[] = [];
    for (const k of keys) {
      try {
        const raw = localStorage.getItem(k);
        const j = raw ? (JSON.parse(raw) as Journal) : null;
        if (j && j.v === 1) journals.push(j);
      } catch {
        /* unreadable journal: leave it in place (not released) */
      }
    }
    if (!journals.length) return { snapshot: base, count: 0, keys };
    journals.sort((a, b) => a.savedAt - b.savedAt);

    const dirty = opts.protectDirty
      ? new Set(this.computeDelta().candidates.map((c) => c.id))
      : new Set<number>();
    const byId = new Map<number, Candidate>();
    for (const c of base.candidates) byId.set(c.id, c);
    const hById = new Map<number, PaymentHistory>();
    for (const h of base.history) hById.set(h.id, h);
    let settings = base.settings;
    let count = 0;

    for (const j of journals) {
      for (const id of j.deletedCandidateIds || []) {
        if (!dirty.has(id)) byId.delete(id);
      }
      for (const c of j.candidates || []) {
        if (dirty.has(c.id)) continue;
        const fields = j.dirty?.[String(c.id)];
        const cur = byId.get(c.id);
        if (!cur || !fields || fields.includes("*")) {
          byId.set(c.id, c);
        } else {
          // only what was edited - never stale copies of the other fields
          byId.set(c.id, applyFields(cur, c, fields));
        }
      }
      for (const id of j.deletedHistoryIds || []) hById.delete(id);
      for (const h of j.history || []) hById.set(h.id, h);
      if (j.settings && !opts.protectDirty) settings = j.settings;
      count +=
        (j.candidates?.length || 0) +
        (j.deletedCandidateIds?.length || 0) +
        (j.history?.length || 0) +
        (j.deletedHistoryIds?.length || 0) +
        (j.settings ? 1 : 0);
    }

    return {
      snapshot: {
        candidates: [...byId.values()],
        history: [...hById.values()],
        settings,
      },
      count,
      keys,
    };
  }

  /** Remove adopted journals - only after markChanged() re-journaled them. */
  releaseOrphans(keys: string[]) {
    releaseKeys(keys);
  }

  private writeJournal(d: Delta) {
    try {
      const empty =
        !d.candidates.length &&
        !d.deletedCandidateIds.length &&
        !d.history.length &&
        !d.deletedHistoryIds.length &&
        !d.settings;
      if (empty) {
        localStorage.removeItem(this.journalKey());
      } else {
        const j: Journal = {
          v: 1,
          savedAt: Date.now(),
          candidates: d.candidates,
          dirty: Object.fromEntries(
            [...d.dirtyFields].map(([id, fs]) => [String(id), [...fs]])
          ),
          deletedCandidateIds: d.deletedCandidateIds,
          history: d.history,
          deletedHistoryIds: d.deletedHistoryIds,
          settings: d.settings,
        };
        localStorage.setItem(this.journalKey(), JSON.stringify(j));
      }
      this.status.journalFailed = false;
    } catch {
      this.status.journalFailed = true;
    }
  }

  // --------------------------------------------------------------- delta --

  private computeDelta(): Delta {
    const cur = this.getState();
    const candidates: Candidate[] = [];
    const candidateMeta = new Map<number, SyncedEntry>();
    const dirtyFields = new Map<number, Set<string>>();
    const seen = new Set<number>();

    for (const c of cur.candidates) {
      seen.add(c.id);
      const base = this.synced.get(c.id);
      const entry = entryOf(c);
      if (!base || this.forceFull.has(c.id)) {
        candidates.push(c);
        candidateMeta.set(c.id, entry);
        dirtyFields.set(c.id, new Set(["*"]));
        continue;
      }
      if (base.sig === entry.sig) continue;
      candidates.push(c);
      candidateMeta.set(c.id, entry);
      const fs = new Set<string>();
      const keys = new Set([
        ...Object.keys(entry.fields),
        ...Object.keys(base.fields),
      ]);
      for (const k of keys) if (entry.fields[k] !== base.fields[k]) fs.add(k);
      dirtyFields.set(c.id, fs);
    }
    const deletedCandidateIds: number[] = [];
    for (const id of this.synced.keys()) if (!seen.has(id)) deletedCandidateIds.push(id);

    const history: PaymentHistory[] = [];
    const historySigs = new Map<number, string>();
    const hSeen = new Set<number>();
    for (const h of cur.history) {
      hSeen.add(h.id);
      const sig = genericSig(h);
      if (this.syncedHistory.get(h.id) !== sig) {
        history.push(h);
        historySigs.set(h.id, sig);
      }
    }
    const deletedHistoryIds: number[] = [];
    for (const id of this.syncedHistory.keys()) if (!hSeen.has(id)) deletedHistoryIds.push(id);

    const sSig = genericSig(cur.settings);
    const settingsChanged = sSig !== this.syncedSettingsSig;

    return {
      candidates,
      candidateMeta,
      dirtyFields,
      deletedCandidateIds,
      history,
      historySigs,
      deletedHistoryIds,
      settings: settingsChanged ? cur.settings : null,
      settingsSig: settingsChanged ? sSig : null,
    };
  }

  private countOf(d: Delta) {
    return (
      d.candidates.length +
      d.deletedCandidateIds.length +
      d.history.length +
      d.deletedHistoryIds.length +
      (d.settings ? 1 : 0)
    );
  }

  private nextChunk(d: Delta): Chunk {
    const candidates = d.candidates.slice(0, this.chunkSize);
    const candidateMeta = new Map<number, SyncedEntry>();
    const dirty = new Map<number, Set<string>>();
    for (const c of candidates) {
      candidateMeta.set(c.id, d.candidateMeta.get(c.id)!);
      dirty.set(c.id, d.dirtyFields.get(c.id) ?? new Set(["*"]));
    }
    const history = d.history.slice(0, MAX_HISTORY_PER_REQUEST);
    const historySigs = new Map<number, string>();
    for (const h of history) historySigs.set(h.id, d.historySigs.get(h.id)!);
    return {
      candidates,
      dirty,
      candidateMeta,
      deletedCandidateIds: d.deletedCandidateIds.slice(0, MAX_DELETES_PER_REQUEST),
      history,
      historySigs,
      deletedHistoryIds: d.deletedHistoryIds.slice(0, MAX_DELETES_PER_REQUEST),
      // settings are small & rarely change - ride along with the first chunk
      settings: d.settings,
      settingsSig: d.settingsSig,
    };
  }

  private emit() {
    this.opts.onChange({ ...this.status });
  }

  // ---------------------------------------------------------------- API ---

  /** Call after ANY state change. Cheap; coalesces and debounces. */
  markChanged() {
    if (!this.baseReady || this.disposed) return;
    this.refresh();
    if (this.status.pending === 0 && !this.running) {
      // Back to exactly what MongoDB has (e.g. a no-op edit or an undo):
      // nothing to send.
      if (this.debounceTimer) {
        clearTimeout(this.debounceTimer);
        this.debounceTimer = null;
      }
      if (this.status.phase === "dirty") this.status.phase = "idle";
      this.emit();
      return;
    }
    if (this.status.phase === "idle" || this.status.phase === "dirty") {
      this.status.phase = "dirty";
    }
    if (this.status.pending > 0) this.opts.onDirty?.();
    this.emit();
    if (this.status.phase === "auth") return;
    if (this.running) return; // the running loop re-checks for new changes
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => {
      this.debounceTimer = null;
      void this.flush();
    }, DEBOUNCE_MS);
  }

  /** Recompute dirty set + journal from current state. */
  private refresh(): Delta {
    const d = this.computeDelta();
    this.dirtyFields = d.dirtyFields;
    this.status.pending = this.countOf(d);
    this.writeJournal(d);
    return d;
  }

  hasUnsaved(): boolean {
    if (!this.baseReady) return false;
    if (this.running || this.debounceTimer) return true;
    return this.countOf(this.computeDelta()) > 0;
  }

  cellState(id: number, field: string): CellSync | undefined {
    const fs = this.dirtyFields.get(id);
    const inflight = this.inflightFields.get(id);
    const key = fieldKeyForColumn(field);
    const hit = (s?: Set<string>) =>
      !!s && (s.has("*") || s.has(key) || (key.startsWith("installments:") && s.has("installments:n")));
    if (inflight && hit(inflight) && this.status.phase === "saving") return "saving";
    if (hit(fs)) {
      if (this.status.phase === "retrying" || this.status.phase === "auth") return "error";
      return this.inflightIds.has(id) ? "saving" : "dirty";
    }
    return undefined;
  }

  /** Save everything now. Resolves true once MongoDB confirmed it all. */
  flush(): Promise<boolean> {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    if (this.status.phase === "auth") this.status.phase = "dirty";
    if (this.running) {
      this.wake?.(); // skip any backoff wait
      return this.running;
    }
    this.running = this.loop().finally(() => {
      this.running = null;
    });
    return this.running;
  }

  private sleep(ms: number) {
    return new Promise<void>((resolve) => {
      const t = setTimeout(() => done(), ms);
      const done = () => {
        clearTimeout(t);
        this.wake = null;
        resolve();
      };
      this.wake = done;
    });
  }

  private async loop(): Promise<boolean> {
    this.runDone = 0;
    this.runPendingAtStart = 0;
    let attempts = 0;

    while (!this.disposed) {
      const d = this.refresh();
      const remaining = this.countOf(d);
      if (!this.runPendingAtStart) this.runPendingAtStart = remaining;

      if (remaining === 0) {
        this.status.phase = "idle";
        this.status.error = null;
        this.status.retryAt = null;
        this.status.lastSavedAt = Date.now();
        this.status.done = 0;
        this.inflightIds.clear();
        this.inflightFields.clear();
        this.emit();
        this.opts.onIdle?.(this.getState());
        return true;
      }

      const chunk = this.nextChunk(d);
      this.inflightIds = new Set(chunk.candidates.map((c) => c.id));
      this.inflightFields = new Map();
      for (const id of this.inflightIds) {
        const f = d.dirtyFields.get(id);
        if (f) this.inflightFields.set(id, f);
      }
      this.status.phase = "saving";
      this.status.done = this.runDone;
      this.status.retryAt = null;
      this.emit();

      try {
        const res = await this.post(chunk);
        this.confirm(chunk, res.missing);
        attempts = 0;
        this.chunkSize = Math.min(MAX_CANDIDATES_PER_REQUEST, this.chunkSize * 2);
        this.runDone +=
          chunk.candidates.length +
          chunk.deletedCandidateIds.length +
          chunk.history.length +
          chunk.deletedHistoryIds.length +
          (chunk.settings ? 1 : 0);
        this.status.done = this.runDone;
        this.status.error = null;
      } catch (e) {
        this.inflightIds.clear();
        this.inflightFields.clear();
        const err = e as Error & { status?: number };
        this.status.error = err.message || "Save failed";
        if (err.status === 401 || err.status === 403) {
          this.status.phase = "auth";
          this.status.error =
            "Session expired - your changes are kept on this device. Sign in again to finish saving.";
          this.emit();
          return false;
        }
        attempts += 1;
        this.chunkSize = Math.max(MIN_CANDIDATES_PER_REQUEST, Math.floor(this.chunkSize / 2));
        const wait = Math.min(MAX_BACKOFF_MS, 1500 * 2 ** Math.min(attempts, 5));
        this.status.phase = "retrying";
        this.status.retryAt = Date.now() + wait;
        this.emit();
        await this.sleep(wait);
      }
    }
    return false;
  }

  private confirm(chunk: Chunk, missing: number[] = []) {
    this.epoch++;
    const gone = new Set(missing);
    for (const [id, entry] of chunk.candidateMeta) {
      if (gone.has(id)) {
        // the document no longer exists on the server (deleted elsewhere):
        // keep it pending and send the whole record next
        this.forceFull.add(id);
        continue;
      }
      this.forceFull.delete(id);
      const prevBase = this.synced.get(id);
      const fs = chunk.dirty.get(id);
      if (prevBase && fs && !fs.has("*")) {
        let w = this.wrote.get(id);
        if (!w) this.wrote.set(id, (w = new Map()));
        for (const k of fs) w.set(k, { mine: entry.fields[k], prev: prevBase.fields[k] });
      } else {
        this.wrote.delete(id);
      }
      this.synced.set(id, entry);
      this.touched.add(id);
      this.deletedTouched.delete(id);
    }
    for (const id of chunk.deletedCandidateIds) {
      this.synced.delete(id);
      this.touched.delete(id);
      this.deletedTouched.add(id);
    }
    for (const [id, sig] of chunk.historySigs) {
      this.syncedHistory.set(id, sig);
      this.touchedHistory.add(id);
      this.deletedTouchedHistory.delete(id);
    }
    for (const id of chunk.deletedHistoryIds) {
      this.syncedHistory.delete(id);
      this.touchedHistory.delete(id);
      this.deletedTouchedHistory.add(id);
    }
    if (chunk.settings && chunk.settingsSig) {
      this.syncedSettingsSig = chunk.settingsSig;
      this.settingsTouched = true;
    }
    this.inflightIds.clear();
    this.inflightFields.clear();
    this.refresh(); // rewrites/clears the journal with what is still pending
  }

  /**
   * New candidates travel whole; existing ones as a patch holding ONLY the
   * fields that were edited, so a stale tab can never overwrite what other
   * people changed in the meantime.
   */
  private bodyOf(chunk: Chunk): string {
    const full: Candidate[] = [];
    const patches: { id: number; set: Record<string, unknown>; unset: string[] }[] = [];
    for (const c of chunk.candidates) {
      const fs = chunk.dirty.get(c.id);
      if (!fs || fs.has("*") || this.forceFull.has(c.id)) {
        full.push(c);
        continue;
      }
      const rec = c as unknown as Record<string, unknown>;
      const set: Record<string, unknown> = {};
      const unset: string[] = [];
      const whole = fs.has("installments:n");
      for (const k of fs) {
        if (k === "id" || k === "_id" || k === "__v") continue;
        if (k === "installments:n") {
          set.installments = Array.isArray(rec.installments) ? rec.installments : [];
        } else if (k.startsWith("installments:")) {
          if (whole) continue;
          const i = Number(k.slice("installments:".length));
          const arr = Array.isArray(rec.installments) ? (rec.installments as unknown[]) : [];
          if (i < arr.length) set[`installments.${i}`] = arr[i];
        } else if (rec[k] === undefined) {
          unset.push(k);
        } else {
          set[k] = rec[k];
        }
      }
      patches.push({ id: c.id, set, unset });
    }
    return JSON.stringify({
      candidates: full,
      patches,
      deletedCandidateIds: chunk.deletedCandidateIds,
      history: chunk.history,
      deletedHistoryIds: chunk.deletedHistoryIds,
      settings: chunk.settings,
    });
  }

  private async post(chunk: Chunk): Promise<{ missing: number[] }> {
    const body = this.bodyOf(chunk);
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS);
    try {
      const res = await fetch("/api/crm/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
        signal: ctrl.signal,
        cache: "no-store",
      });
      if (!res.ok) {
        let msg = `Save failed (${res.status})`;
        try {
          const j = await res.json();
          if (j?.error) msg = String(j.error);
        } catch {
          /* ignore */
        }
        throw Object.assign(new Error(msg), { status: res.status });
      }
      let missing: number[] = [];
      try {
        const j = await res.json();
        if (Array.isArray(j?.missing)) missing = j.missing.map(Number);
      } catch {
        /* an empty body is fine */
      }
      return { missing };
    } catch (e) {
      if ((e as Error).name === "AbortError") {
        throw new Error("Save timed out - retrying");
      }
      if (e instanceof TypeError) throw new Error("Offline - will retry automatically");
      throw e;
    } finally {
      clearTimeout(timer);
    }
  }

  /** Best-effort send while the page is going away (refresh / close). */
  flushOnExit() {
    if (!this.baseReady || this.disposed) return;
    const d = this.refresh();
    if (!this.countOf(d)) return;
    const chunk = this.nextChunk(d);
    const body = this.bodyOf(chunk);
    if (body.length > EXIT_BODY_LIMIT) return; // journal recovers it next load
    try {
      void fetch("/api/crm/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
        keepalive: true,
        cache: "no-store",
      }).catch(() => {});
    } catch {
      /* journal will recover */
    }
  }

  /** Retry right away (the browser came back online, tab refocused...). */
  nudge() {
    if (this.status.phase === "retrying") this.wake?.();
    else if (this.status.phase === "auth" && !this.running) void this.flush();
  }

  /** Re-arm after dispose() (React Strict Mode mounts effects twice). */
  activate() {
    this.disposed = false;
    beat(this.opts.userKey);
    if (!this.heartbeat) {
      this.heartbeat = setInterval(() => beat(this.opts.userKey), 3000);
    }
  }

  /** The page is going away: let a live/next tab adopt our leftovers now. */
  markTabClosing() {
    markTabDead(this.opts.userKey);
  }

  /**
   * Compare MongoDB's real contents with what we believe is saved.
   *  - our write is missing/different  -> queued again (resend)
   *  - someone else changed it          -> their version is adopted (if `adopt`)
   * The caller applies the returned adoptions to its state, then flushes.
   */
  reconcile(
    server: Snapshot,
    adopt: boolean,
    mode: "verify" | "poll" = "verify",
    epoch?: number
  ): ReconcileResult {
    const r: ReconcileResult = {
      matched: 0,
      resend: 0,
      adoptCandidates: [],
      removeCandidateIds: [],
      adoptHistory: [],
      removeHistoryIds: [],
      adoptSettings: null,
    };
    if (epoch !== undefined && epoch !== this.epoch) {
      r.stale = true;
      return r;
    }
    const srv = new Map<number, { c: Candidate; e: SyncedEntry }>();
    for (const c of server.candidates) srv.set(c.id, { c, e: entryOf(c) });
    const cur = new Map<number, Candidate>();
    for (const c of this.getState().candidates) cur.set(c.id, c);

    // Candidates are merged FIELD BY FIELD: another user's change to a field
    // I did not touch is taken over, my unsaved edits are kept.
    for (const [id, s] of srv) {
      const mine = this.synced.get(id);
      const local = cur.get(id);
      if (mine) {
        if (!local) continue; // my own deletion is still pending
        if (!adopt) {
          if (s.e.sig === mine.sig) r.matched++;
          continue;
        }
        const res = mergeCandidate(
          local,
          mine,
          s,
          mode === "verify" ? this.wrote.get(id) : undefined
        );
        this.synced.set(id, res.entry);
        r.resend += res.lost;
        if (res.candidate) this.wrote.delete(id); // others changed it since
        if (res.candidate) r.adoptCandidates.push(res.candidate);
        else r.matched++;
      } else if (this.deletedTouched.has(id)) {
        if (mode === "verify") {
          this.synced.set(id, s.e); // makes the pending deletion re-emit
          r.resend++;
        }
      } else if (!local && adopt) {
        // a candidate somebody else added
        this.synced.set(id, s.e);
        r.adoptCandidates.push(s.c);
      }
    }
    for (const [id, mine] of [...this.synced]) {
      if (srv.has(id)) continue;
      const local = cur.get(id);
      if (!local) continue; // pending local deletion
      const unsaved = entryOf(local).sig !== mine.sig;
      if (unsaved || (mode === "verify" && this.touched.has(id))) {
        // I still have edits for it (or my save went missing): keep it and
        // write it back whole
        this.synced.delete(id);
        r.resend++;
      } else if (adopt) {
        // somebody else deleted it
        this.synced.delete(id);
        r.removeCandidateIds.push(id);
      }
    }

    const hSrv = new Map<number, { h: PaymentHistory; sig: string }>();
    for (const h of server.history) hSrv.set(h.id, { h, sig: genericSig(h) });
    for (const [id, sig] of [...this.syncedHistory]) {
      const s = hSrv.get(id);
      if (!s) {
        if (mode === "verify" && this.touchedHistory.has(id)) {
          this.syncedHistory.delete(id);
          r.resend++;
        } else if (adopt) {
          this.syncedHistory.delete(id);
          r.removeHistoryIds.push(id);
        }
      } else if (s.sig !== sig) {
        if (mode === "verify" && this.touchedHistory.has(id)) {
          this.syncedHistory.delete(id);
          r.resend++;
        } else if (adopt) {
          this.syncedHistory.set(id, s.sig);
          r.adoptHistory.push(s.h);
        }
      }
    }
    for (const [id, s] of hSrv) {
      if (this.syncedHistory.has(id)) continue;
      if (mode === "verify" && this.deletedTouchedHistory.has(id)) {
        this.syncedHistory.set(id, s.sig);
        r.resend++;
      } else if (adopt) {
        this.syncedHistory.set(id, s.sig);
        r.adoptHistory.push(s.h);
      }
    }

    const sSig = genericSig(server.settings);
    if (sSig !== this.syncedSettingsSig) {
      if (mode === "verify" && this.settingsTouched) {
        this.syncedSettingsSig = "";
        r.resend++;
      } else if (adopt) {
        this.syncedSettingsSig = sSig;
        r.adoptSettings = server.settings;
      }
    }
    return r;
  }

  dispose() {
    if (this.heartbeat) {
      clearInterval(this.heartbeat);
      this.heartbeat = null;
    }
    this.disposed = true;
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.wake?.();
  }
}
