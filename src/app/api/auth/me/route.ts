import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { User } from "@/lib/models/User";
import { getSessionFromCookies } from "@/lib/auth";

export async function GET() {
  try {
    const session = await getSessionFromCookies();
    if (!session) {
      return NextResponse.json({ authenticated: false }, { status: 401 });
    }

    await connectDB();
    const user = await User.findById(session.sub).lean();
    if (!user || user.email !== session.email) {
      return NextResponse.json({ authenticated: false }, { status: 401 });
    }

    return NextResponse.json({
      authenticated: true,
      user: {
        email: user.email,
        name: user.name || user.email.split("@")[0],
      },
    });
  } catch (error) {
    console.error("auth/me error:", error);
    return NextResponse.json({ authenticated: false }, { status: 500 });
  }
}
