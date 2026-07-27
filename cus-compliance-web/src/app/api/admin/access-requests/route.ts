import { connectDB } from "@/lib/mongodb";
import { AccessRequest } from "@/lib/models/AccessRequest";
import { User } from "@/lib/models/User";
import { requireAdmin } from "@/lib/session-user";
import { corsPreflightResponse, jsonWithCors } from "@/lib/cors";

export async function OPTIONS(request: Request) {
  return corsPreflightResponse(request);
}

export async function GET(request: Request) {
  try {
    const auth = await requireAdmin(request);
    if ("error" in auth) {
      return jsonWithCors(request, { error: auth.error }, { status: auth.status });
    }

    await connectDB();
    const url = new URL(request.url);
    const statusParam = url.searchParams.get("status") || "pending";

    const filter =
      statusParam === "all"
        ? {}
        : {
            status: (statusParam === "approved" || statusParam === "denied"
              ? statusParam
              : "pending") as "pending" | "approved" | "denied",
          };

    const docs = await AccessRequest.find(filter)
      .sort({ createdAt: -1 })
      .lean();

    return jsonWithCors(request, {
      requests: docs.map((d) => ({
        id: String(d._id),
        userId: String(d.userId),
        email: d.email,
        name: d.name || "",
        requestedRole: d.requestedRole || "compliance_user",
        message: d.message || "",
        status: d.status,
        createdAt: d.createdAt,
        reviewedAt: d.reviewedAt,
      })),
    });
  } catch (error) {
    console.error("admin/access-requests GET error:", error);
    return jsonWithCors(
      request,
      { error: "Failed to list access requests" },
      { status: 500 }
    );
  }
}
