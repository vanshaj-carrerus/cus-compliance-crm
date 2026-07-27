import bcrypt from "bcryptjs";
import { connectDB } from "@/lib/mongodb";
import { User } from "@/lib/models/User";
import {
  clearAuthCookies,
  getVerifiedFromRequest,
  setSessionCookie,
  signSessionToken,
} from "@/lib/auth";
import { canAccessCrm, normalizeRole } from "@/lib/roles";
import { normalizeFeatures } from "@/lib/features";
import { corsPreflightResponse, jsonWithCors } from "@/lib/cors";

export async function OPTIONS(request: Request) {
  return corsPreflightResponse(request);
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      password?: string;
      verifiedToken?: string;
    };
    const verified = await getVerifiedFromRequest(
      request,
      body.verifiedToken || null
    );
    if (!verified) {
      return jsonWithCors(
        request,
        { error: "Email not verified. Please enter your code first." },
        { status: 401 }
      );
    }

    const password = String(body.password || "");
    if (password.length < 8) {
      return jsonWithCors(
        request,
        { error: "Password must be at least 8 characters" },
        { status: 400 }
      );
    }

    await connectDB();
    const user = await User.findOne({ email: verified.email });
    if (!user?.passwordHash) {
      return jsonWithCors(
        request,
        { error: "No account found for this email" },
        { status: 404 }
      );
    }

    const role = normalizeRole(user.role);
    if (!canAccessCrm(role)) {
      return jsonWithCors(
        request,
        {
          error:
            "Password reset is only available for Compliance Admin and Compliance User accounts",
        },
        { status: 403 }
      );
    }

    user.passwordHash = await bcrypt.hash(password, 12);
    if (user.status === "invited") user.status = "active";
    await user.save();

    const features = normalizeFeatures(
      (user as { features?: unknown }).features,
      role
    );
    const sessionToken = await signSessionToken({
      sub: user._id.toString(),
      email: user.email,
      role,
      features,
    });

    const res = jsonWithCors(request, {
      message: "Password updated",
      user: {
        email: user.email,
        name: user.name,
        role,
        features,
      },
      sessionToken,
    });
    clearAuthCookies(res);
    setSessionCookie(res, sessionToken);
    return res;
  } catch (error) {
    console.error("reset-password error:", error);
    return jsonWithCors(
      request,
      { error: "Failed to reset password" },
      { status: 500 }
    );
  }
}
