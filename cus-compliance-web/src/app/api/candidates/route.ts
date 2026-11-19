import { NextRequest } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { CandidateModel } from "@/lib/models/Candidate";
import { normalizeCandidate, demoData } from "@/lib/crm";
import { corsPreflightResponse, jsonWithCors } from "@/lib/cors";
import { getCandidateScope, foreignCandidateIds } from "@/lib/crm-scope";

export const dynamic = "force-dynamic";

export async function OPTIONS(request: Request) {
  return corsPreflightResponse(request);
}

export async function GET(request: Request) {
  try {
    await connectDB();
    const scope = await getCandidateScope(request);
    if (!scope) return jsonWithCors(request, { error: "Unauthorized" }, { status: 401 });
    const filter = scope.restricted ? scope.filter : {};
    let docs = await CandidateModel.find(filter).lean();
    const noSeed = new URL(request.url).searchParams.get("verify") === "1";
    // Seed demo data only when the WHOLE collection is empty (a scoped user
    // with no candidates must not trigger it).
    if (!docs.length && !noSeed && (await CandidateModel.estimatedDocumentCount()) === 0) {
      const seed = demoData();
      await CandidateModel.insertMany(seed);
      docs = await CandidateModel.find(filter).lean();
    }
    const candidates = docs.map((d) =>
      normalizeCandidate(d as Record<string, unknown>)
    );
    return jsonWithCors(request, { candidates });
  } catch (e) {
    console.error(e);
    return jsonWithCors(
      request,
      { error: e instanceof Error ? e.message : "Failed to load candidates" },
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
    const candidate = normalizeCandidate(body);
    if (scope.restricted) {
      if ((await foreignCandidateIds(scope, [candidate.id])).size) {
        return jsonWithCors(req, { error: "Forbidden" }, { status: 403 });
      }
      if (!scope.owns(candidate.assignedTo)) candidate.assignedTo = scope.primary;
    }
    await CandidateModel.findOneAndUpdate(
      { id: candidate.id },
      candidate,
      { upsert: true, new: true }
    );
    return jsonWithCors(req, { candidate });
  } catch (e) {
    console.error(e);
    return jsonWithCors(
      req,
      { error: e instanceof Error ? e.message : "Failed to create candidate" },
      { status: 500 }
    );
  }
}

export async function PUT(req: NextRequest) {
  try {
    await connectDB();
    const scope = await getCandidateScope(req);
    if (!scope) return jsonWithCors(req, { error: "Unauthorized" }, { status: 401 });
    // Replaces EVERY candidate - Compliance Admin only.
    if (scope.restricted) return jsonWithCors(req, { error: "Forbidden" }, { status: 403 });
    const body = await req.json();
    const list = Array.isArray(body.candidates) ? body.candidates : [];
    const candidates = list.map((c: Record<string, unknown>) =>
      normalizeCandidate(c)
    );
    await CandidateModel.deleteMany({});
    if (candidates.length) await CandidateModel.insertMany(candidates);
    return jsonWithCors(req, { candidates, ok: true });
  } catch (e) {
    console.error(e);
    return jsonWithCors(
      req,
      { error: e instanceof Error ? e.message : "Failed to replace candidates" },
      { status: 500 }
    );
  }
}
