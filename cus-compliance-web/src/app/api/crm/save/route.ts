import { NextRequest } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { CandidateModel } from "@/lib/models/Candidate";
import { PaymentHistoryModel } from "@/lib/models/PaymentHistory";
import { SettingsModel } from "@/lib/models/Settings";
import { normalizeCandidate, mergeSettings } from "@/lib/crm";
import type { Candidate } from "@/lib/crm/types";
import { corsPreflightResponse, jsonWithCors } from "@/lib/cors";

export const dynamic = "force-dynamic";

export async function OPTIONS(request: Request) {
  return corsPreflightResponse(request);
}

/**
 * Full snapshot save — used by debounced queueSave / undo restore.
 *
 * Upserts by `id` instead of delete-all-then-insert-all: two overlapping
 * saves (e.g. a second browser tab, or a slow request that a retry raced
 * past) used to both clear the collection and then insertMany the same
 * ids, which trips the unique index and 500s. Upserting per document is
 * safe to run concurrently; the trailing deleteMany just prunes ids that
 * are no longer in this snapshot.
 */
export async function PUT(req: NextRequest) {
  try {
    await connectDB();
    const body = await req.json();
    const candidates = (Array.isArray(body.candidates) ? body.candidates : []).map(
      (c: Record<string, unknown>) => normalizeCandidate(c)
    );
    const history = Array.isArray(body.history) ? body.history : [];
    const settings = mergeSettings(body.settings || null);

    if (candidates.length) {
      await CandidateModel.bulkWrite(
        candidates.map((c: Candidate) => ({
          replaceOne: { filter: { id: c.id }, replacement: c, upsert: true },
        })),
        { ordered: false }
      );
    }
    await CandidateModel.deleteMany({
      id: { $nin: candidates.map((c: Candidate) => c.id) },
    });

    if (history.length) {
      await PaymentHistoryModel.bulkWrite(
        history.map((h: Record<string, unknown>) => ({
          replaceOne: { filter: { id: h.id }, replacement: h, upsert: true },
        })),
        { ordered: false }
      );
    }
    await PaymentHistoryModel.deleteMany({
      id: { $nin: history.map((h: Record<string, unknown>) => h.id) },
    });

    await SettingsModel.findOneAndUpdate(
      { key: "settings" },
      { key: "settings", value: settings },
      { upsert: true }
    );

    return jsonWithCors(req, { ok: true });
  } catch (e) {
    console.error(e);
    return jsonWithCors(
      req,
      { error: e instanceof Error ? e.message : "Save failed" },
      { status: 500 }
    );
  }
}
