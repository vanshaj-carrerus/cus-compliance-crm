import { NextRequest } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { PaymentHistoryModel } from "@/lib/models/PaymentHistory";
import type { PaymentHistory } from "@/lib/crm";
import { corsPreflightResponse, jsonWithCors } from "@/lib/cors";
import {
  getCandidateScope,
  foreignCandidateIds,
  ownCandidateIds,
} from "@/lib/crm-scope";

export const dynamic = "force-dynamic";

export async function OPTIONS(request: Request) {
  return corsPreflightResponse(request);
}

export async function GET(request: Request) {
  try {
    await connectDB();
    const scope = await getCandidateScope(request);
    if (!scope) return jsonWithCors(request, { error: "Unauthorized" }, { status: 401 });
    // Scoped users only see payment history of their own candidates.
    const filter = scope.restricted
      ? { candidateId: { $in: await ownCandidateIds(scope) } }
      : {};
    const history = (await PaymentHistoryModel.find(
      filter
    ).lean()) as unknown as PaymentHistory[];
    return jsonWithCors(request, { history });
  } catch (e) {
    console.error(e);
    return jsonWithCors(
      request,
      { error: e instanceof Error ? e.message : "Failed to load history" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    await connectDB();
    const scope = await getCandidateScope(req);
    if (!scope) return jsonWithCors(req, { error: "Unauthorized" }, { status: 401 });
    const body = await req.json();
    if (Array.isArray(body.history)) {
      // Replaces ALL history - Compliance Admin only.
      if (scope.restricted) return jsonWithCors(req, { error: "Forbidden" }, { status: 403 });
      await PaymentHistoryModel.deleteMany({});
      if (body.history.length) await PaymentHistoryModel.insertMany(body.history);
      return jsonWithCors(req, { history: body.history, ok: true });
    }
    const entry = body as PaymentHistory;
    if (
      scope.restricted &&
      (await foreignCandidateIds(scope, [Number(entry.candidateId)])).size
    ) {
      return jsonWithCors(req, { error: "Forbidden" }, { status: 403 });
    }
    await PaymentHistoryModel.findOneAndUpdate(
      { id: entry.id },
      entry,
      { upsert: true }
    );
    return jsonWithCors(req, { entry });
  } catch (e) {
    console.error(e);
    return jsonWithCors(
      req,
      { error: e instanceof Error ? e.message : "Failed to save history" },
      { status: 500 }
    );
  }
}

export async function PUT(req: NextRequest) {
  return POST(req);
}
