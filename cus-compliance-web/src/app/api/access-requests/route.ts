import { connectDB } from "@/lib/mongodb";
import { AccessRequest } from "@/lib/models/AccessRequest";
import { loadSessionUser } from "@/lib/session-user";
import { hasCrmFeatures } from "@/lib/features";
import { corsPreflightResponse, jsonWithCors } from "@/lib/cors";

export async function OPTIONS(request: Request) {
  return corsPreflightResponse(request);
}

/** Current user's pending access request (if any). */
export async function GET(request: Request) {
  try {
    const auth = await loadSessionUser(request);
    if (!auth) {
      return jsonWithCors(request, { error: "Unauthorized" }, { status: 401 });
    }

    await connectDB();
    const pending = await AccessRequest.findOne({
      userId: auth.user.id,
      status: "pending",
    }).lean();

    return jsonWithCors(request, {
      hasCrmAccess: hasCrmFeatures(auth.user.features),
      request: pending
        ? {
            id: String(pending._id),
            status: pending.status,
            requestedRole: pending.requestedRole,
            message: pending.message || "",
            createdAt: pending.createdAt,
          }
        : null,
    });
  } catch (error) {
    console.error("access-requests GET error:", error);
    return jsonWithCors(
      request,
      { error: "Failed to load access request" },
      { status: 500 }
    );
  }
}

/** Normal user asks for Compliance User access. */
export async function POST(request: Request) {
  try {
    const auth = await loadSessionUser(request);
    if (!auth) {
      return jsonWithCors(request, { error: "Unauthorized" }, { status: 401 });
    }

    if (hasCrmFeatures(auth.user.features)) {
      return jsonWithCors(
        request,
        { error: "You already have CRM access" },
        { status: 400 }
      );
    }

    const body = (await request.json().catch(() => ({}))) as {
      message?: string;
    };
    const message = String(body.message || "").trim().slice(0, 500);

    await connectDB();
    const existing = await AccessRequest.findOne({
      userId: auth.user.id,
      status: "pending",
    });
    if (existing) {
      return jsonWithCors(
        request,
        {
          error: "You already have a pending request",
          request: {
            id: String(existing._id),
            status: existing.status,
            createdAt: existing.createdAt,
          },
        },
        { status: 409 }
      );
    }

    const doc = await AccessRequest.create({
      userId: auth.user.id,
      email: auth.user.email,
      name: auth.user.name,
      requestedRole: "compliance_user",
      message,
      status: "pending",
    });

    return jsonWithCors(
      request,
      {
        message: "Access request submitted",
        request: {
          id: String(doc._id),
          status: doc.status,
          requestedRole: doc.requestedRole,
          createdAt: doc.createdAt,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("access-requests POST error:", error);
    return jsonWithCors(
      request,
      { error: "Failed to submit access request" },
      { status: 500 }
    );
  }
}
