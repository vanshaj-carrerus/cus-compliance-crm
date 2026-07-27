import { connectDB } from "@/lib/mongodb";
import { User, type UserDoc } from "@/lib/models/User";
import { getSessionFromRequest, type SessionPayload } from "@/lib/auth";
import {
  normalizeFeatures,
  hasAdminFeature,
  hasCrmFeatures,
  type CrmFeature,
} from "@/lib/features";
import { normalizeRole, type UserRole } from "@/lib/roles";

export type AuthUser = {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  status: "invited" | "active";
  features: CrmFeature[];
};

export async function loadSessionUser(
  req: Request
): Promise<{ session: SessionPayload; user: AuthUser } | null> {
  const session = await getSessionFromRequest(req);
  if (!session) return null;

  await connectDB();
  const doc = await User.findById(session.sub).lean();
  if (!doc || doc.email !== session.email) return null;

  const role = normalizeRole(doc.role);
  const features = normalizeFeatures(
    (doc as { features?: unknown }).features,
    role
  );
  return {
    session: { ...session, role },
    user: {
      id: String(doc._id),
      email: doc.email,
      name: doc.name || doc.email.split("@")[0],
      role,
      status: doc.status === "invited" ? "invited" : "active",
      features,
    },
  };
}

export async function requireCrmAccess(req: Request) {
  const auth = await loadSessionUser(req);
  if (!auth) return { error: "Unauthorized" as const, status: 401 as const };
  if (!hasCrmFeatures(auth.user.features)) {
    return { error: "Forbidden" as const, status: 403 as const };
  }
  return auth;
}

/** Admin page /admin APIs — requires feature `admin`. */
export async function requireAdmin(req: Request) {
  const auth = await loadSessionUser(req);
  if (!auth) return { error: "Unauthorized" as const, status: 401 as const };
  if (!hasAdminFeature(auth.user.features)) {
    return { error: "Admin access required" as const, status: 403 as const };
  }
  return auth;
}

export function publicUser(doc: UserDoc | Record<string, unknown>) {
  const role = normalizeRole((doc as { role?: unknown }).role);
  const email = String((doc as { email?: string }).email || "");
  const name = String((doc as { name?: string }).name || "");
  const status =
    (doc as { status?: string }).status === "invited" ? "invited" : "active";
  const passwordHash = String(
    (doc as { passwordHash?: string }).passwordHash || ""
  );
  const features = normalizeFeatures(
    (doc as { features?: unknown }).features,
    role
  );
  return {
    id: String((doc as { _id: unknown })._id),
    email,
    name: name || email.split("@")[0],
    role,
    status,
    features,
    hasPassword: Boolean(passwordHash),
    createdAt: (doc as { createdAt?: Date }).createdAt ?? null,
  };
}
