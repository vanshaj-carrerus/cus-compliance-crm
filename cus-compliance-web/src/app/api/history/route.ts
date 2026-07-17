import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { PaymentHistoryModel } from "@/lib/models/PaymentHistory";
import type { PaymentHistory } from "@/lib/crm";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await connectDB();
    const history = (await PaymentHistoryModel.find({}).lean()) as unknown as PaymentHistory[];
    return NextResponse.json({ history });
  } catch (e) {
    console.error(e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to load history" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    await connectDB();
    const body = await req.json();
    if (Array.isArray(body.history)) {
      await PaymentHistoryModel.deleteMany({});
      if (body.history.length) await PaymentHistoryModel.insertMany(body.history);
      return NextResponse.json({ history: body.history, ok: true });
    }
    const entry = body as PaymentHistory;
    await PaymentHistoryModel.findOneAndUpdate(
      { id: entry.id },
      entry,
      { upsert: true }
    );
    return NextResponse.json({ entry });
  } catch (e) {
    console.error(e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to save history" },
      { status: 500 }
    );
  }
}

export async function PUT(req: NextRequest) {
  return POST(req);
}
