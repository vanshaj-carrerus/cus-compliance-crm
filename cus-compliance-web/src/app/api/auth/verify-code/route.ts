import { connectDB } from "@/lib/mongodb";
import { VerificationCode } from "@/lib/models/VerificationCode";
import { User } from "@/lib/models/User";
import {
  isEmailAllowed,
  isValidEmail,
  normalizeEmail,
  setVerifiedCookie,
  signVerifiedToken,
} from "@/lib/auth";
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

    if (!isEmailAllowed(email)) {
      return jsonWithCors(
        request,
        { error: "This email is not authorized" },
        { status: 403 }
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
    const verifiedToken = await signVerifiedToken(email);
    const res = jsonWithCors(request, {
      message: "Verification successful",
      hasAccount: Boolean(user),
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
