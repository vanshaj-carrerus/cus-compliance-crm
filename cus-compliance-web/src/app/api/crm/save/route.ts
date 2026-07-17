import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { CandidateModel } from "@/lib/models/Candidate";
import { PaymentHistoryModel } from "@/lib/models/PaymentHistory";
import { SettingsModel } from "@/lib/models/Settings";
import { normalizeCandidate, mergeSettings } from "@/lib/crm";

export const dynamic = "force-dynamic";

/** Full snapshot save — used by debounced queueSave / undo restore */
export async function PUT(req: NextRequest) {
  try {
    await connectDB();
    const body = await req.json();
    const candidates = (Array.isArray(body.candidates) ? body.candidates : []).map(
      (c: Record<string, unknown>) => normalizeCandidate(c)
    );
    const history = Array.isArray(body.history) ? body.history : [];
    const settings = mergeSettings(body.settings || null);

    await CandidateModel.deleteMany({});
    await PaymentHistoryModel.deleteMany({});
    if (candidates.length) await CandidateModel.insertMany(candidates);
    if (history.length) await PaymentHistoryModel.insertMany(history);
    await SettingsModel.findOneAndUpdate(
      { key: "settings" },
      { key: "settings", value: settings },
      { upsert: true }
    );

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error(e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Save failed" },
      { status: 500 }
    );
  }
}
