import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { CandidateModel } from "@/lib/models/Candidate";
import { PaymentHistoryModel } from "@/lib/models/PaymentHistory";
import { normalizeCandidate } from "@/lib/crm";
import { getCandidateScope, foreignCandidateIds } from "@/lib/crm-scope";

export const dynamic = "force-dynamic";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await connectDB();
    const { id } = await params;
    const numId = Number(id);
    const scope = await getCandidateScope(req);
    if (!scope) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (scope.restricted && (await foreignCandidateIds(scope, [numId])).size) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const body = await req.json();
    const existing = await CandidateModel.findOne({ id: numId }).lean();
    if (!existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const candidate = normalizeCandidate({
      ...existing,
      ...body,
      id: numId,
    } as Record<string, unknown>);
    if (scope.restricted && !scope.owns(candidate.assignedTo)) candidate.assignedTo = scope.primary;
    await CandidateModel.findOneAndUpdate({ id: numId }, candidate, {
      upsert: true,
    });
    return NextResponse.json({ candidate });
  } catch (e) {
    console.error(e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to update" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await connectDB();
    const { id } = await params;
    const numId = Number(id);
    const scope = await getCandidateScope(req);
    if (!scope) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (scope.restricted && (await foreignCandidateIds(scope, [numId])).size) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    await CandidateModel.deleteOne({ id: numId });
    await PaymentHistoryModel.deleteMany({ candidateId: numId });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error(e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to delete" },
      { status: 500 }
    );
  }
}
