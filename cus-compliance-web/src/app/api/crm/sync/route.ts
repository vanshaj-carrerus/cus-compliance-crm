import { NextRequest } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { CandidateModel } from "@/lib/models/Candidate";
import { PaymentHistoryModel } from "@/lib/models/PaymentHistory";
import { SettingsModel } from "@/lib/models/Settings";
import { normalizeCandidate, mergeSettings } from "@/lib/crm";
import { corsPreflightResponse, jsonWithCors } from "@/lib/cors";

export const dynamic = "force-dynamic";

// Keep a single request small enough for a free (M0) Atlas cluster and for
// serverless body limits. The client already chunks; this is the backstop.
const MAX_DOCS_PER_REQUEST = 250;

export async function OPTIONS(request: Request) {
  return corsPreflightResponse(request);
}

type Patch = { id?: unknown; set?: unknown; unset?: unknown };

type Delta = {
  candidates?: Record<string, unknown>[];
  /** Field-level edits of existing candidates: only what the user changed. */
  patches?: Patch[];
  deletedCandidateIds?: unknown[];
  history?: Record<string, unknown>[];
  deletedHistoryIds?: unknown[];
  settings?: Record<string, unknown> | null;
};

// Top-level candidate fields a patch may touch (everything in the schema
// except the identity fields), plus `installments.<n>` for a single row.
const PATCHABLE = new Set(
  Object.keys(CandidateModel.schema.paths).filter(
    (k) => !k.includes(".") && !["_id", "__v", "id"].includes(k)
  )
);
const INSTALLMENT_PATH = /^installments\.\d{1,3}$/;

function cleanPatch(p: Patch): {
  id: number;
  set: Record<string, unknown>;
  unset: Record<string, 1>;
} | null {
  const id = Number(p?.id);
  if (!Number.isFinite(id)) return null;
  const set: Record<string, unknown> = {};
  const unset: Record<string, 1> = {};
  const rawSet = p.set && typeof p.set === "object" ? (p.set as Record<string, unknown>) : {};
  for (const [k, v] of Object.entries(rawSet)) {
    if (PATCHABLE.has(k) || INSTALLMENT_PATH.test(k)) set[k] = v;
    else console.warn("sync: ignored unknown patch field", k);
  }
  if (Array.isArray(p.unset)) {
    for (const k of p.unset) if (typeof k === "string" && PATCHABLE.has(k)) unset[k] = 1;
  }
  // a whole-array write and a single-row write on the same path would clash
  if ("installments" in set) {
    for (const k of Object.keys(set)) if (k.startsWith("installments.")) delete set[k];
  }
  return { id, set, unset };
}

const finiteIds = (list: unknown): number[] =>
  (Array.isArray(list) ? list : [])
    .map((x) => Number(x))
    .filter((n) => Number.isFinite(n));

/**
 * Delta save. The client sends ONLY the documents that changed since the
 * last confirmed save, plus explicit deletions. Unlike the legacy full
 * snapshot PUT /api/crm/save this can never prune documents it was not told
 * about, so a stale tab / second user / half-loaded client cannot wipe data,
 * and each request costs a handful of writes instead of rewriting everything.
 *
 * Every operation is an idempotent upsert-by-id, so the client may safely
 * retry the same request any number of times.
 */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as Delta;
    const rawCandidates = Array.isArray(body.candidates) ? body.candidates : [];
    const rawHistory = Array.isArray(body.history) ? body.history : [];
    const rawPatches = Array.isArray(body.patches) ? body.patches : [];
    const delCandidates = finiteIds(body.deletedCandidateIds);
    const delHistory = finiteIds(body.deletedHistoryIds);

    if (
      rawCandidates.length + rawPatches.length + rawHistory.length + delCandidates.length + delHistory.length >
      MAX_DOCS_PER_REQUEST * 2
    ) {
      return jsonWithCors(req, { error: "Payload too large" }, { status: 413 });
    }

    await connectDB();

    const candidates = rawCandidates
      .filter((c) => Number.isFinite(Number(c?.id)))
      .map((c) => normalizeCandidate(c));
    const history = rawHistory.filter((h) => Number.isFinite(Number(h?.id)));

    if (candidates.length) {
      const res = await CandidateModel.bulkWrite(
        candidates.map((c) => ({
          replaceOne: { filter: { id: c.id }, replacement: c, upsert: true },
        })),
        { ordered: false }
      );
      const ok = (res.matchedCount ?? 0) + (res.upsertedCount ?? 0);
      if (ok < candidates.length) {
        // Don't let the client believe it saved when Mongo did not confirm
        // every document - it will keep the data locally and retry.
        throw new Error(
          `Mongo confirmed ${ok} of ${candidates.length} candidate writes`
        );
      }
    }
    // Field-level edits: $set ONLY the fields the user changed, so nothing
    // another user saved in the meantime is overwritten (last save wins per
    // field). A patch for a document that no longer exists is reported back
    // as "missing"; the client then sends that candidate whole.
    const missing: number[] = [];
    const patches = rawPatches
      .map(cleanPatch)
      .filter((p): p is NonNullable<ReturnType<typeof cleanPatch>> => p !== null);
    if (patches.length) {
      const found = new Set(
        (
          await CandidateModel.find(
            { id: { $in: patches.map((p) => p.id) } },
            { id: 1, _id: 0 }
          ).lean()
        ).map((d: { id: number }) => d.id)
      );
      const live = patches.filter((p) => found.has(p.id));
      for (const p of patches) if (!found.has(p.id)) missing.push(p.id);
      const ops = live
        .filter((p) => Object.keys(p.set).length || Object.keys(p.unset).length)
        .map((p) => {
          const update: Record<string, unknown> = {
            $set: { ...p.set, updatedAt: new Date().toISOString() },
          };
          if (Object.keys(p.unset).length) update.$unset = p.unset;
          return { updateOne: { filter: { id: p.id }, update } };
        });
      if (ops.length) {
        const res = await CandidateModel.bulkWrite(ops, { ordered: false });
        if ((res.matchedCount ?? 0) < ops.length) {
          // deleted by someone in between: the client will retry and the
          // retry reports it as missing
          throw new Error(`Mongo confirmed ${res.matchedCount ?? 0} of ${ops.length} edits - retrying`);
        }
      }
    }
    if (delCandidates.length) {
      await CandidateModel.deleteMany({ id: { $in: delCandidates } });
    }

    if (history.length) {
      const res = await PaymentHistoryModel.bulkWrite(
        history.map((h) => ({
          replaceOne: { filter: { id: Number(h.id) }, replacement: h, upsert: true },
        })),
        { ordered: false }
      );
      const ok = (res.matchedCount ?? 0) + (res.upsertedCount ?? 0);
      if (ok < history.length) {
        throw new Error(`Mongo confirmed ${ok} of ${history.length} history writes`);
      }
    }
    if (delHistory.length) {
      await PaymentHistoryModel.deleteMany({ id: { $in: delHistory } });
    }

    if (body.settings && typeof body.settings === "object") {
      await SettingsModel.findOneAndUpdate(
        { key: "settings" },
        { key: "settings", value: mergeSettings(body.settings) },
        { upsert: true }
      );
    }

    return jsonWithCors(req, {
      ok: true,
      candidates: candidates.length,
      patched: patches.length - missing.length,
      missing,
      deletedCandidates: delCandidates.length,
      history: history.length,
      deletedHistory: delHistory.length,
      settings: Boolean(body.settings),
    });
  } catch (e) {
    console.error(e);
    return jsonWithCors(
      req,
      { error: e instanceof Error ? e.message : "Save failed" },
      { status: 500 }
    );
  }
}
