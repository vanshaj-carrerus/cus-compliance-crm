import bcrypt from "bcryptjs";
import { connectDB } from "@/lib/mongodb";
import { User } from "@/lib/models/User";
import {
  clearAuthCookies,
  getVerifiedFromRequest,
  setSessionCookie,
  signSessionToken,
} from "@/lib/auth";
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
    const existing = await User.findOne({ email: verified.email });
    if (existing) {
      return jsonWithCors(
        request,
        { error: "Account already exists. Please sign in with your password." },
        { status: 400 }
      );
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const user = await User.create({
      email: verified.email,
      passwordHash,
      name: verified.email.split("@")[0] || "",
    });

    const sessionToken = await signSessionToken({
      sub: user._id.toString(),
      email: user.email,
    });

    const res = jsonWithCors(request, {
      message: "Account created",
      user: { email: user.email, name: user.name },
      sessionToken,
    });
    clearAuthCookies(res);
    setSessionCookie(res, sessionToken);
    return res;
  } catch (error) {
    console.error("set-password error:", error);
    return jsonWithCors(
      request,
      { error: "Failed to create account" },
      { status: 500 }
    );
  }
}
