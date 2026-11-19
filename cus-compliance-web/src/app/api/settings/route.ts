import { NextRequest } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { SettingsModel } from "@/lib/models/Settings";
import { mergeSettings } from "@/lib/crm";
import { corsPreflightResponse, jsonWithCors } from "@/lib/cors";
import { getCandidateScope, ownIdSet, scopeSettings, mergeScopedSettings } from "@/lib/crm-scope";

export const dynamic = "force-dynamic";

export async function OPTIONS(request: Request) {
  return corsPreflightResponse(request);
}

export async function GET(request: Request) {
  try {
    await connectDB();
    const doc = await SettingsModel.findOne({ key: "settings" }).lean();
    const scope = await getCandidateScope(request);
    if (!scope) return jsonWithCors(request, { error: "Unauthorized" }, { status: 401 });
    let settings = mergeSettings(
      (doc?.value as Record<string, unknown>) || null
    );
    if (scope.restricted) settings = scopeSettings(settings, await ownIdSet(scope));
    return jsonWithCors(request, { settings });
  } catch (e) {
    console.error(e);
    return jsonWithCors(
      request,
      { error: e instanceof Error ? e.message : "Failed to load settings" },
      { status: 500 }
    );
  }
}

export async function PUT(req: NextRequest) {
  try {
    await connectDB();
    const body = await req.json();
    const scope = await getCandidateScope(req);
    if (!scope) return jsonWithCors(req, { error: "Unauthorized" }, { status: 401 });
    let settings = mergeSettings(body.settings || body);
    if (scope.restricted) {
      const doc = await SettingsModel.findOne({ key: "settings" }).lean();
      const existing = mergeSettings((doc?.value as Record<string, unknown>) || null);
      settings = mergeScopedSettings(existing, settings, await ownIdSet(scope));
    }
    await SettingsModel.findOneAndUpdate(
      { key: "settings" },
      { key: "settings", value: settings },
      { upsert: true }
    );
    return jsonWithCors(req, { settings, ok: true });
  } catch (e) {
    console.error(e);
    return jsonWithCors(
      req,
      { error: e instanceof Error ? e.message : "Failed to save settings" },
      { status: 500 }
    );
  }
}
