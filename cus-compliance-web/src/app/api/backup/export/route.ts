import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { CandidateModel } from "@/lib/models/Candidate";
import { PaymentHistoryModel } from "@/lib/models/PaymentHistory";
import { SettingsModel } from "@/lib/models/Settings";
import { normalizeCandidate, mergeSettings } from "@/lib/crm";
import { getCandidateScope, ownCandidateIds, ownIdSet, scopeSettings } from "@/lib/crm-scope";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    await connectDB();
    const scope = await getCandidateScope(req);
    if (!scope) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const ownIds = scope.restricted ? await ownIdSet(scope) : null;
    const docs = await CandidateModel.find(scope.restricted ? scope.filter : {}).lean();
    const history = await PaymentHistoryModel.find(
      scope.restricted ? { candidateId: { $in: await ownCandidateIds(scope) } } : {}
    ).lean();
    const settingsDoc = await SettingsModel.findOne({ key: "settings" }).lean();
    const data = {
      version: "3.0",
      exportedAt: new Date().toISOString(),
      candidates: docs.map((d) =>
        normalizeCandidate(d as Record<string, unknown>)
      ),
      history,
      settings: (() => {
        const s = mergeSettings((settingsDoc?.value as Record<string, unknown>) || null);
        return scope.restricted ? scopeSettings(s, ownIds!) : s;
      })(),
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
