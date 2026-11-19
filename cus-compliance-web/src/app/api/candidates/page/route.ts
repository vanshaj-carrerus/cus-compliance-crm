import { connectDB } from "@/lib/mongodb";
import { CandidateModel } from "@/lib/models/Candidate";
import { normalizeCandidate, getTotalPaid, getRemaining } from "@/lib/crm";
import { corsPreflightResponse, jsonWithCors } from "@/lib/cors";
import { getCandidateScope } from "@/lib/crm-scope";

export const dynamic = "force-dynamic";

export async function OPTIONS(request: Request) {
  return corsPreflightResponse(request);
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Server-side paging for the Master sheet. Search and every filter are
 * applied by MongoDB across ALL candidates; only the requested page of rows
 * is returned (size=0 means all). Totals cover every match, not just the page.
 *
 * Query: page (0-based), size, q, floor, status, po, assignedTo, poMonth,
 *        followup (overdue|today|future|never), method, today (YYYY-MM-DD)
 */
export async function GET(request: Request) {
  try {
    await connectDB();
    const sp = new URL(request.url).searchParams;
    const size = Math.max(0, Math.floor(Number(sp.get("size")) || 0));
    const reqPage = Math.max(0, Math.floor(Number(sp.get("page")) || 0));
    const q = (sp.get("q") || "").trim();
    const today = sp.get("today") || new Date().toISOString().slice(0, 10);

    const scope = await getCandidateScope(request);
    if (!scope) return jsonWithCors(request, { error: "Unauthorized" }, { status: 401 });
    // Permanent per-user scope: cannot be removed by any query parameter.
    const and: Record<string, unknown>[] = scope.restricted ? [scope.filter] : [];
    for (const f of ["floor", "po", "assignedTo", "poMonth"] as const) {
      const v = sp.get(f);
      if (v) and.push({ [f]: v });
    }
    const status = sp.get("status");
    if (status) {
      // a blank status displays as "Active"
      and.push(
        status === "Active"
          ? { $or: [{ status: "Active" }, { status: "" }, { status: null }, { status: { $exists: false } }] }
          : { status }
      );
    }
    if (q) {
      const re = new RegExp(escapeRe(q), "i");
      and.push({
        $or: ["name", "po", "floor", "status", "assignedTo", "remarks", "poMonth", "phoneNumber"].map(
          (k) => ({ [k]: re })
        ),
      });
    }
    const followup = sp.get("followup");
    if (followup === "overdue")
      and.push({ nextFollowUpDate: { $nin: ["", null], $lt: today } });
    else if (followup === "today") and.push({ nextFollowUpDate: today });
    else if (followup === "future") and.push({ nextFollowUpDate: { $gt: today } });
    else if (followup === "never")
      and.push({ $or: [{ nextFollowUpDate: "" }, { nextFollowUpDate: null }, { nextFollowUpDate: { $exists: false } }] });
    const method = sp.get("method");
    if (method) and.push({ contactMethod: method });

    const filter = and.length ? { $and: and } : {};

    const total = await CandidateModel.countDocuments(filter);
    const totalPages = size === 0 ? 1 : Math.max(1, Math.ceil(total / size));
    const page = Math.min(reqPage, totalPages - 1);

    // Totals need every match's installments but never leave the server.
    const sums = await CandidateModel.find(filter)
      .select("totalServiceFee annualPackage serviceFeePercent installments")
      .lean();
    let committed = 0;
    let paid = 0;
    let remaining = 0;
    for (const d of sums) {
      const c = normalizeCandidate(d as Record<string, unknown>);
      committed += Number(c.totalServiceFee) || 0;
      paid += getTotalPaid(c);
      remaining += getRemaining(c);
    }

    let cursor = CandidateModel.find(filter).sort({ _id: 1 });
    if (size > 0) cursor = cursor.skip(page * size).limit(size);
    const docs = await cursor.lean();
    const candidates = docs.map((d) => normalizeCandidate(d as Record<string, unknown>));

    return jsonWithCors(request, {
      candidates,
      total,
      page,
      size,
      totalPages,
      totals: { committed, paid, remaining },
    });
  } catch (e) {
    console.error(e);
    return jsonWithCors(
      request,
      { error: e instanceof Error ? e.message : "Failed to load candidates page" },
      { status: 500 }
    );
  }
}
