import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { SettingsModel } from "@/lib/models/Settings";
import { mergeSettings } from "@/lib/crm";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await connectDB();
    const doc = await SettingsModel.findOne({ key: "settings" }).lean();
    const settings = mergeSettings(
      (doc?.value as Record<string, unknown>) || null
    );
    return NextResponse.json({ settings });
  } catch (e) {
    console.error(e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to load settings" },
      { status: 500 }
    );
  }
}

export async function PUT(req: NextRequest) {
  try {
    await connectDB();
    const body = await req.json();
    const settings = mergeSettings(body.settings || body);
    await SettingsModel.findOneAndUpdate(
      { key: "settings" },
      { key: "settings", value: settings },
      { upsert: true }
    );
    return NextResponse.json({ settings, ok: true });
  } catch (e) {
    console.error(e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to save settings" },
      { status: 500 }
    );
  }
}
