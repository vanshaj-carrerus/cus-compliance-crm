import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { CandidateModel } from "@/lib/models/Candidate";
import { normalizeCandidate, demoData } from "@/lib/crm";

export const dynamic = "force-dynamic";

export async function GET() {
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
    return NextResponse.json({ candidates });
  } catch (e) {
    console.error(e);
    return NextResponse.json(
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
    return NextResponse.json({ candidate });
  } catch (e) {
    console.error(e);
    return NextResponse.json(
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
    return NextResponse.json({ candidates, ok: true });
  } catch (e) {
    console.error(e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to replace candidates" },
      { status: 500 }
    );
  }
}
