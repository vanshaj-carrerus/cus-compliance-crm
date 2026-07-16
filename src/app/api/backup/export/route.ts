import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { CandidateModel } from "@/lib/models/Candidate";
import { PaymentHistoryModel } from "@/lib/models/PaymentHistory";
import { SettingsModel } from "@/lib/models/Settings";
import { normalizeCandidate, mergeSettings } from "@/lib/crm";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await connectDB();
    const docs = await CandidateModel.find({}).lean();
    const history = await PaymentHistoryModel.find({}).lean();
    const settingsDoc = await SettingsModel.findOne({ key: "settings" }).lean();
    const data = {
      version: "3.0",
      exportedAt: new Date().toISOString(),
      candidates: docs.map((d) =>
        normalizeCandidate(d as Record<string, unknown>)
      ),
      history,
      settings: mergeSettings(
        (settingsDoc?.value as Record<string, unknown>) || null
      ),
    };
    return NextResponse.json(data);
  } catch (e) {
    console.error(e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Export failed" },
      { status: 500 }
    );
  }
}
