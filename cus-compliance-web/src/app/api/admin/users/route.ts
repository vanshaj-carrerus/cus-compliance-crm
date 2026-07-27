import { connectDB } from "@/lib/mongodb";
import { User } from "@/lib/models/User";
import { isValidEmail, normalizeEmail } from "@/lib/auth";
import { requireAdmin, publicUser } from "@/lib/session-user";
import {
  defaultFeaturesForRole,
  sanitizeFeatures,
} from "@/lib/features";
import { isUserRole, type UserRole } from "@/lib/roles";
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
    const users = await User.find().sort({ createdAt: -1 }).lean();
    return jsonWithCors(request, {
      users: users.map((u) => publicUser(u)),
    });
  } catch (error) {
    console.error("admin/users GET error:", error);
    return jsonWithCors(
      request,
      { error: "Failed to list users" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireAdmin(request);
    if ("error" in auth) {
      return jsonWithCors(request, { error: auth.error }, { status: auth.status });
    }

    const body = (await request.json()) as {
      email?: string;
      name?: string;
      role?: string;
      features?: unknown;
    };
    const email = normalizeEmail(body.email || "");
    const name = String(body.name || "").trim();
    const role: UserRole = isUserRole(body.role) ? body.role : "compliance_user";
    const features =
      body.features !== undefined
        ? sanitizeFeatures(body.features)
        : defaultFeaturesForRole(role);

    if (!isValidEmail(email)) {
      return jsonWithCors(
        request,
        { error: "Valid email is required" },
        { status: 400 }
      );
    }

    await connectDB();
    const existing = await User.findOne({ email });
    if (existing) {
      return jsonWithCors(
        request,
        { error: "A user with this email already exists" },
        { status: 409 }
      );
    }

    const user = await User.create({
      email,
      name: name || email.split("@")[0],
      role,
      features,
      status: "invited",
      passwordHash: "",
    });

    return jsonWithCors(
      request,
      {
        message: "User invited",
        user: publicUser(user),
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("admin/users POST error:", error);
    return jsonWithCors(
      request,
      { error: "Failed to invite user" },
      { status: 500 }
    );
  }
}
