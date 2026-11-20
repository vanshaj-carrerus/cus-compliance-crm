import { connectDB } from "@/lib/mongodb";
import { CandidateModel } from "@/lib/models/Candidate";
import { corsPreflightResponse, jsonWithCors } from "@/lib/cors";
import { getCandidateScope } from "@/lib/crm-scope";

export const dynamic = "force-dynamic";

export async function OPTIONS(request: Request) {
  return corsPreflightResponse(request);
}

/**
 * Which Master-sheet page (unfiltered, same ordering as /api/candidates/page)
 * a candidate sits on - used by search results to jump to and highlight them.
 * Query: id (candidate id), size (page size; 0 = everything on one page)
 */
export async function GET(request: Request) {
  try {
    await connectDB();
    const sp = new URL(request.url).searchParams;
    const id = Number(sp.get("id"));
    const size = Math.max(0, Math.floor(Number(sp.get("size")) || 0));
    if (!Number.isFinite(id)) {
      return jsonWithCors(request, { error: "Invalid id" }, { status: 400 });
    }

    const scope = await getCandidateScope(request);
    if (!scope) return jsonWithCors(request, { error: "Unauthorized" }, { status: 401 });
    // Same permanent per-user scope as the page endpoint.
    const base: Record<string, unknown> = scope.restricted ? scope.filter : {};

    const target = await CandidateModel.findOne({ ...base, id }, { _id: 1 }).lean();
    if (!target) {
      return jsonWithCors(request, { error: "Candidate not found" }, { status: 404 });
    }
    const before = await CandidateModel.countDocuments({
      ...base,
      _id: { $lt: (target as { _id: unknown })._id },
    });
    const page = size > 0 ? Math.floor(before / size) : 0;
    return jsonWithCors(request, { page, index: before });
  } catch (e) {
    console.error(e);
    return jsonWithCors(
      request,
      { error: e instanceof Error ? e.message : "Failed to locate candidate" },
      { status: 500 }
    );
  }
}
