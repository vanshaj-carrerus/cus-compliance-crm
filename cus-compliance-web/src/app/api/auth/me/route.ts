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
 * Fast path: return JWT claims (no Mongo) when the token already has features.
 * Pass ?sync=1 to reload role/features from MongoDB (after admin edits).
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

    const url = new URL(request.url);
    const sync = url.searchParams.get("sync") === "1";
    const hasJwtFeatures = Array.isArray(session.features);

    // Warm path — skip Atlas round-trip for normal page loads.
    if (!sync && hasJwtFeatures) {
      const role = normalizeRole(session.role);
      const features = normalizeFeatures(session.features, role);
      return jsonWithCors(request, {
        authenticated: true,
        user: {
          id: session.sub,
          email: session.email,
          name: session.email.split("@")[0],
          role,
          status: "active",
          features,
        },
        source: "session",
      });
    }

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
