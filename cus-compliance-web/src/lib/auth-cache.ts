import {
  normalizeFeatures,
  type CrmFeature,
} from "@/lib/features";
import { normalizeRole, type UserRole } from "@/lib/roles";

export type CachedAuthUser = {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  status: "invited" | "active";
  features: CrmFeature[];
};

/** Module cache — survives client navigations / Strict Mode remounts. */
let authCache: CachedAuthUser | null | undefined = undefined;
let authInflight: Promise<CachedAuthUser | null> | null = null;

export function peekAuthCache(): CachedAuthUser | null | undefined {
  return authCache;
}

export function setAuthCache(user: CachedAuthUser | null) {
  authCache = user;
}

export function clearAuthCache() {
  authCache = undefined;
  authInflight = null;
}

function applyPayload(data: {
  authenticated?: boolean;
  user?: Record<string, unknown>;
}): CachedAuthUser | null {
  if (!data.authenticated || !data.user) return null;
  const role = normalizeRole(data.user.role);
  return {
    id: String(data.user.id || ""),
    email: String(data.user.email || ""),
    name: String(data.user.name || ""),
    role,
    status: data.user.status === "invited" ? "invited" : "active",
    features: normalizeFeatures(data.user.features, role),
  };
}

/**
 * Load session once per tab lifetime.
 * - Default: JWT fast path (`/api/auth/me`) — no Mongo when features are in cookie.
 * - `sync: true`: force Mongo refresh (after admin edits).
 */
export async function ensureAuth(options?: {
  sync?: boolean;
}): Promise<CachedAuthUser | null> {
  const sync = Boolean(options?.sync);

  if (!sync && authCache !== undefined) {
    return authCache;
  }

  if (!sync && authInflight) {
    return authInflight;
  }

  const run = (async () => {
    const url = sync ? "/api/auth/me?sync=1" : "/api/auth/me";
    const res = await fetch(url);
    if (!res.ok) {
      authCache = null;
      return null;
    }
    const data = await res.json();
    const user = applyPayload(data);
    authCache = user;
    return user;
  })();

  if (!sync) authInflight = run;
  try {
    return await run;
  } finally {
    if (!sync) authInflight = null;
  }
}
