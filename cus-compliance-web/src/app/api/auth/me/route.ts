import { connectDB } from "@/lib/mongodb";
import { User } from "@/lib/models/User";
import { getSessionFromRequest } from "@/lib/auth";
import { corsPreflightResponse, jsonWithCors } from "@/lib/cors";

export async function OPTIONS(request: Request) {
  return corsPreflightResponse(request);
}

export async function GET(request: Request) {
  try {
    const session = await getSessionFromRequest(request);
    if (!session) {
      return jsonWithCors(
        request,
        { authenticated: false },
        { status: 401 }
      );
    }

    await connectDB();
    const user = await User.findById(session.sub).lean();
    if (!user || user.email !== session.email) {
      return jsonWithCors(
        request,
        { authenticated: false },
        { status: 401 }
      );
    }

    return jsonWithCors(request, {
      authenticated: true,
      user: {
        email: user.email,
        name: user.name || user.email.split("@")[0],
      },
    });
  } catch (error) {
    console.error("auth/me error:", error);
    return jsonWithCors(
      request,
      { authenticated: false },
      { status: 500 }
    );
  }
}
