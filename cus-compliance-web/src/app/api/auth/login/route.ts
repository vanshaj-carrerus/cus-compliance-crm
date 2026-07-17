import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { connectDB } from "@/lib/mongodb";
import { User } from "@/lib/models/User";
import {
  clearAuthCookies,
  getVerifiedFromCookies,
  setSessionCookie,
  signSessionToken,
} from "@/lib/auth";

export async function POST(request: Request) {
  try {
    const verified = await getVerifiedFromCookies();
    if (!verified) {
      return NextResponse.json(
        { error: "Email not verified. Please enter your code first." },
        { status: 401 }
      );
    }

    const body = (await request.json()) as { password?: string };
    const password = String(body.password || "");
    if (!password) {
      return NextResponse.json(
        { error: "Password is required" },
        { status: 400 }
      );
    }

    await connectDB();
    const user = await User.findOne({ email: verified.email });
    if (!user) {
      return NextResponse.json(
        { error: "No account found. Please create a password first." },
        { status: 404 }
      );
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      return NextResponse.json(
        { error: "Incorrect password" },
        { status: 401 }
      );
    }

    const sessionToken = await signSessionToken({
      sub: user._id.toString(),
      email: user.email,
    });

    const res = NextResponse.json({
      message: "Signed in",
      user: { email: user.email, name: user.name },
    });
    clearAuthCookies(res);
    setSessionCookie(res, sessionToken);
    return res;
  } catch (error) {
    console.error("login error:", error);
    return NextResponse.json({ error: "Login failed" }, { status: 500 });
  }
}
