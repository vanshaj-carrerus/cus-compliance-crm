import { connectDB } from "@/lib/mongodb";
import { User } from "@/lib/models/User";
import {
  getSessionFromRequest,
  setSessionCookie,
  signSessionToken,
} from "@/lib/auth";
import { normalizeFeatures } from "@/lib/features";
import { normalizeRole } from "@/lib/roles";
import { corsPreflightResponse, jsonWithCors } from "@/lib/cors";

export async function OPTIONS(request: Request) {
  return corsPreflightResponse(request);
}

/**
 * Always reads role / page access from MongoDB, so a change an admin makes in
 * Admin Users (pages toggled, role changed) shows up without the user having
 * to sign out and in again. (A JWT-only shortcut used to live here; it kept
 * serving the pages from the day the user logged in, so sidebars went stale.)
 * The session cookie is re-signed below whenever role/pages changed.
 */
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

    const hasJwtFeatures = Array.isArray(session.features);

    await connectDB();
    const user = await User.findById(session.sub)
      .select("email name role status features")
      .lean();
    if (!user || user.email !== session.email) {
      return jsonWithCors(
        request,
        { authenticated: false },
        { status: 401 }
      );
    }

    const role = normalizeRole(user.role);
    const features = normalizeFeatures(
      (user as { features?: unknown }).features,
      role
    );
    const name = user.name || user.email.split("@")[0];
    const payload = {
      authenticated: true,
      user: {
        id: String(user._id),
        email: user.email,
        name,
        role,
        status: user.status === "invited" ? "invited" : "active",
        features,
      },
      source: "db",
    };

    const res = jsonWithCors(request, payload);

    // Keep JWT in sync after admin upgrades / feature edits.
    const sessionFeatures = normalizeFeatures(session.features, session.role);
    const featuresChanged =
      sessionFeatures.length !== features.length ||
      sessionFeatures.some((f, i) => f !== features[i]);
    if (session.role !== role || featuresChanged || !hasJwtFeatures) {
      const sessionToken = await signSessionToken({
        sub: String(user._id),
        email: user.email,
        role,
        features,
      });
      setSessionCookie(res, sessionToken);
    }

    return res;
  } catch (error) {
    console.error("auth/me error:", error);
    return jsonWithCors(
      request,
      { authenticated: false },
      { status: 500 }
    );
  }
}
