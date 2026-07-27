import mongoose from "mongoose";
import { connectDB } from "@/lib/mongodb";
import { AccessRequest } from "@/lib/models/AccessRequest";
import { User } from "@/lib/models/User";
import { requireAdmin } from "@/lib/session-user";
import { DEFAULT_COMPLIANCE_USER_FEATURES } from "@/lib/features";
import { corsPreflightResponse, jsonWithCors } from "@/lib/cors";

export async function OPTIONS(request: Request) {
  return corsPreflightResponse(request);
}

type RouteCtx = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, ctx: RouteCtx) {
  try {
    const auth = await requireAdmin(request);
    if ("error" in auth) {
      return jsonWithCors(request, { error: auth.error }, { status: auth.status });
    }

    const { id } = await ctx.params;
    const body = (await request.json()) as { action?: string };
    const action = String(body.action || "").toLowerCase();

    if (action !== "approve" && action !== "deny") {
      return jsonWithCors(
        request,
        { error: "action must be approve or deny" },
        { status: 400 }
      );
    }

    await connectDB();
    const doc = await AccessRequest.findById(id);
    if (!doc) {
      return jsonWithCors(
        request,
        { error: "Request not found" },
        { status: 404 }
      );
    }
    if (doc.status !== "pending") {
      return jsonWithCors(
        request,
        { error: "Request is already resolved" },
        { status: 400 }
      );
    }

    if (action === "approve") {
      const user = await User.findById(doc.userId);
      if (!user) {
        return jsonWithCors(
          request,
          { error: "User account no longer exists" },
          { status: 404 }
        );
      }
      if (user.role !== "compliance_admin") {
        user.role = "compliance_user";
        user.features = [...DEFAULT_COMPLIANCE_USER_FEATURES];
        user.status = "active";
        await user.save();
      }
      doc.status = "approved";
    } else {
      doc.status = "denied";
    }

    doc.reviewedBy = new mongoose.Types.ObjectId(auth.user.id);
    doc.reviewedAt = new Date();
    await doc.save();

    return jsonWithCors(request, {
      message: action === "approve" ? "Request approved" : "Request denied",
      request: {
        id: String(doc._id),
        status: doc.status,
        userId: String(doc.userId),
      },
    });
  } catch (error) {
    console.error("admin/access-requests PATCH error:", error);
    return jsonWithCors(
      request,
      { error: "Failed to update access request" },
      { status: 500 }
    );
  }
}
