import { NextRequest } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { CandidateModel } from "@/lib/models/Candidate";
import { normalizeCandidate, demoData } from "@/lib/crm";
import { corsPreflightResponse, jsonWithCors } from "@/lib/cors";

export const dynamic = "force-dynamic";

export async function OPTIONS(request: Request) {
  return corsPreflightResponse(request);
}

export async function GET(request: Request) {
  try {
    await connectDB();
    let docs = await CandidateModel.find({}).lean();
    if (!docs.length) {
      const seed = demoData();
      await CandidateModel.insertMany(seed);
      docs = await CandidateModel.find({}).lean();
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
    const body = await req.json();
    const candidate = normalizeCandidate(body);
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
