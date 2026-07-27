import { connectDB } from "@/lib/mongodb";
import { VerificationCode } from "@/lib/models/VerificationCode";
import { User } from "@/lib/models/User";
import {
  isValidEmail,
  normalizeEmail,
  setVerifiedCookie,
  signVerifiedToken,
} from "@/lib/auth";
import { canAccessCrm, normalizeRole } from "@/lib/roles";
import { corsPreflightResponse, jsonWithCors } from "@/lib/cors";

export async function OPTIONS(request: Request) {
  return corsPreflightResponse(request);
}

export async function POST(request: Request) {
  try {
    await connectDB();
    const body = (await request.json()) as { email?: string; code?: string };
    const email = normalizeEmail(body.email || "");
    const code = String(body.code || "").trim();

    if (!isValidEmail(email) || !code) {
      return jsonWithCors(
        request,
        { error: "Email and code are required" },
        { status: 400 }
      );
    }

    const stored = await VerificationCode.findOne({ email });
    if (!stored) {
      return jsonWithCors(
        request,
        { error: "No verification code found for this email" },
        { status: 400 }
      );
    }

    if (stored.expires < Date.now()) {
      await VerificationCode.deleteOne({ email });
      return jsonWithCors(
        request,
        { error: "Verification code expired" },
        { status: 400 }
      );
    }

    if (stored.code !== code) {
      return jsonWithCors(
        request,
        { error: "Invalid verification code" },
        { status: 400 }
      );
    }

    await VerificationCode.deleteOne({ email });

    const user = await User.findOne({ email });
    const hasAccount = Boolean(user?.passwordHash);
    const role = user ? normalizeRole(user.role) : null;
    const canResetPassword = Boolean(role && canAccessCrm(role));
    const verifiedToken = await signVerifiedToken(email);
    const res = jsonWithCors(request, {
      message: "Verification successful",
      hasAccount,
      canResetPassword,
      email,
      verifiedToken,
    });
    setVerifiedCookie(res, verifiedToken);
    return res;
  } catch (error) {
    console.error("verify-code error:", error);
    return jsonWithCors(
      request,
      { error: "Verification failed" },
      { status: 500 }
    );
  }
}
