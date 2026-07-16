import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { CandidateModel } from "@/lib/models/Candidate";
import { PaymentHistoryModel } from "@/lib/models/PaymentHistory";
import { SettingsModel } from "@/lib/models/Settings";
import { normalizeCandidate, mergeSettings } from "@/lib/crm";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    await connectDB();
    const data = await req.json();
    if (!Array.isArray(data.candidates)) {
      return NextResponse.json(
        { error: "Invalid backup file" },
        { status: 400 }
      );
    }
    const candidates = data.candidates.map((c: Record<string, unknown>) =>
      normalizeCandidate(c)
    );
    const history = Array.isArray(data.history) ? data.history : [];
    const settings = mergeSettings(data.settings || null);

    await CandidateModel.deleteMany({});
    await PaymentHistoryModel.deleteMany({});
    if (candidates.length) await CandidateModel.insertMany(candidates);
    if (history.length) await PaymentHistoryModel.insertMany(history);
    await SettingsModel.findOneAndUpdate(
      { key: "settings" },
      { key: "settings", value: settings },
      { upsert: true }
    );

    return NextResponse.json({
      ok: true,
      candidates,
      history,
      settings,
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Import failed" },
      { status: 500 }
    );
  }
}
