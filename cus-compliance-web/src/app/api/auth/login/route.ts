import bcrypt from "bcryptjs";
import { connectDB } from "@/lib/mongodb";
import { User } from "@/lib/models/User";
import {
  clearAuthCookies,
  getVerifiedFromRequest,
  setSessionCookie,
  signSessionToken,
} from "@/lib/auth";
import { normalizeRole } from "@/lib/roles";
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
    if (!password) {
      return jsonWithCors(
        request,
        { error: "Password is required" },
        { status: 400 }
      );
    }

    await connectDB();
    const user = await User.findOne({ email: verified.email });
    if (!user?.passwordHash) {
      return jsonWithCors(
        request,
        { error: "No account found. Please create a password first." },
        { status: 404 }
      );
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      return jsonWithCors(
        request,
        { error: "Incorrect password" },
        { status: 401 }
      );
    }

    if (user.status === "invited") {
      user.status = "active";
      await user.save();
    }

    const role = normalizeRole(user.role);
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
      message: "Signed in",
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
    console.error("login error:", error);
    return jsonWithCors(request, { error: "Login failed" }, { status: 500 });
  }
}
