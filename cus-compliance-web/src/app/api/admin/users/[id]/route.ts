import { connectDB } from "@/lib/mongodb";
import { User } from "@/lib/models/User";
import { isValidEmail, normalizeEmail } from "@/lib/auth";
import { requireAdmin, publicUser } from "@/lib/session-user";
import {
  defaultFeaturesForRole,
  hasAdminFeature,
  normalizeFeatures,
  sanitizeFeatures,
} from "@/lib/features";
import { isUserRole, normalizeRole, type UserRole } from "@/lib/roles";
import { corsPreflightResponse, jsonWithCors } from "@/lib/cors";

export async function OPTIONS(request: Request) {
  return corsPreflightResponse(request);
}

type RouteCtx = { params: Promise<{ id: string }> };

async function countUsersWithAdminFeature() {
  // Prefer indexed-ish queries over loading every user into memory.
  const [withFeature, adminsWithoutFeaturesField] = await Promise.all([
    User.countDocuments({ features: "admin" }),
    User.countDocuments({
      role: "compliance_admin",
      $or: [{ features: { $exists: false } }, { features: null }],
    }),
  ]);
  return withFeature + adminsWithoutFeaturesField;
}

export async function PATCH(request: Request, ctx: RouteCtx) {
  try {
    const auth = await requireAdmin(request);
    if ("error" in auth) {
      return jsonWithCors(request, { error: auth.error }, { status: auth.status });
    }

    const { id } = await ctx.params;
    const body = (await request.json()) as {
      name?: string;
      email?: string;
      role?: string;
      features?: unknown;
    };

    await connectDB();
    const user = await User.findById(id);
    if (!user) {
      return jsonWithCors(request, { error: "User not found" }, { status: 404 });
    }

    if (body.name !== undefined) {
      user.name = String(body.name || "").trim();
    }

    if (body.email !== undefined) {
      const email = normalizeEmail(body.email);
      if (!isValidEmail(email)) {
        return jsonWithCors(
          request,
          { error: "Valid email is required" },
          { status: 400 }
        );
      }
      if (email !== user.email) {
        const clash = await User.findOne({ email });
        if (clash) {
          return jsonWithCors(
            request,
            { error: "A user with this email already exists" },
            { status: 409 }
          );
        }
        user.email = email;
      }
    }

    const prevRole = normalizeRole(user.role);
    const prevFeatures = normalizeFeatures(
      (user as { features?: unknown }).features,
      prevRole
    );

    if (body.role !== undefined) {
      if (!isUserRole(body.role)) {
        return jsonWithCors(request, { error: "Invalid role" }, { status: 400 });
      }
      const nextRole = body.role as UserRole;

      if (
        String(user._id) === auth.user.id &&
        nextRole !== "compliance_admin"
      ) {
        return jsonWithCors(
          request,
          { error: "You cannot remove your own admin role" },
          { status: 400 }
        );
      }

      if (
        user.role === "compliance_admin" &&
        nextRole !== "compliance_admin"
      ) {
        const adminCount = await User.countDocuments({
          role: "compliance_admin",
        });
        if (adminCount <= 1) {
          return jsonWithCors(
            request,
            { error: "At least one compliance admin is required" },
            { status: 400 }
          );
        }
      }

      user.role = nextRole;
      // Role change without explicit features → seed defaults for new role.
      if (body.features === undefined) {
        user.features = defaultFeaturesForRole(nextRole);
      }
    }

    if (body.features !== undefined) {
      const nextFeatures = sanitizeFeatures(body.features);
      const removingOwnAdmin =
        String(user._id) === auth.user.id &&
        hasAdminFeature(prevFeatures) &&
        !hasAdminFeature(nextFeatures);

      if (removingOwnAdmin) {
        return jsonWithCors(
          request,
          { error: "You cannot remove your own admin page access" },
          { status: 400 }
        );
      }

      if (hasAdminFeature(prevFeatures) && !hasAdminFeature(nextFeatures)) {
        const adminFeatureCount = await countUsersWithAdminFeature();
        if (adminFeatureCount <= 1) {
          return jsonWithCors(
            request,
            { error: "At least one user must keep Admin Users access" },
            { status: 400 }
          );
        }
      }

      user.features = nextFeatures;

      // Page access requires a CRM role for API middleware.
      const currentRole = normalizeRole(user.role);
      if (nextFeatures.length > 0 && currentRole === "user") {
        user.role = hasAdminFeature(nextFeatures)
          ? "compliance_admin"
          : "compliance_user";
      }
      if (nextFeatures.length === 0 && currentRole !== "compliance_admin") {
        user.role = "user";
      }
    }

    await user.save();
    return jsonWithCors(request, {
      message: "User updated",
      user: publicUser(user),
    });
  } catch (error) {
    console.error("admin/users PATCH error:", error);
    return jsonWithCors(
      request,
      { error: "Failed to update user" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request, ctx: RouteCtx) {
  try {
    const auth = await requireAdmin(request);
    if ("error" in auth) {
      return jsonWithCors(request, { error: auth.error }, { status: auth.status });
    }

    const { id } = await ctx.params;
    if (id === auth.user.id) {
      return jsonWithCors(
        request,
        { error: "You cannot remove your own account" },
        { status: 400 }
      );
    }

    await connectDB();
    const user = await User.findById(id);
    if (!user) {
      return jsonWithCors(request, { error: "User not found" }, { status: 404 });
    }

    const role = normalizeRole(user.role);
    const features = normalizeFeatures(
      (user as { features?: unknown }).features,
      role
    );

    if (user.role === "compliance_admin") {
      const adminCount = await User.countDocuments({
        role: "compliance_admin",
      });
      if (adminCount <= 1) {
        return jsonWithCors(
          request,
          { error: "At least one compliance admin is required" },
          { status: 400 }
        );
      }
    }

    if (hasAdminFeature(features)) {
      const adminFeatureCount = await countUsersWithAdminFeature();
      if (adminFeatureCount <= 1) {
        return jsonWithCors(
          request,
          { error: "At least one user must keep Admin Users access" },
          { status: 400 }
        );
      }
    }

    await User.deleteOne({ _id: id });
    return jsonWithCors(request, { message: "User removed" });
  } catch (error) {
    console.error("admin/users DELETE error:", error);
    return jsonWithCors(
      request,
      { error: "Failed to remove user" },
      { status: 500 }
    );
  }
}
