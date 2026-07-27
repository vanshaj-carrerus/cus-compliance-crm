import type { UserRole } from "@/lib/roles";

export const CRM_FEATURES = [
  "dashboard",
  "daily",
  "master",
  "compliance",
  "target",
  "incentive",
  "history",
  "reports",
  "workflows",
  "backup",
  "admin",
] as const;

export type CrmFeature = (typeof CRM_FEATURES)[number];

export const FEATURE_LABELS: Record<CrmFeature, string> = {
  dashboard: "Dashboard",
  daily: "Daily Follow-up",
  master: "Master P.O Sheet",
  compliance: "Compliance Sheet",
  target: "Payment Target",
  incentive: "Incentive Sheet",
  history: "Payment History",
  reports: "Reports",
  workflows: "Workflows",
  backup: "Backup & Restore",
  admin: "Admin Users",
};

/** Default pages for Compliance User (no admin-only pages). */
export const DEFAULT_COMPLIANCE_USER_FEATURES: CrmFeature[] = [
  "dashboard",
  "daily",
  "master",
  "compliance",
  "target",
  "workflows",
  "backup",
];

/** Full access including Admin Users page. */
export const DEFAULT_ADMIN_FEATURES: CrmFeature[] = [...CRM_FEATURES];

export function isCrmFeature(value: unknown): value is CrmFeature {
  return (
    typeof value === "string" &&
    (CRM_FEATURES as readonly string[]).includes(value)
  );
}

/** Filter to known features, preserve order of CRM_FEATURES. */
export function sanitizeFeatures(list: unknown): CrmFeature[] {
  if (!Array.isArray(list)) return [];
  const set = new Set(
    list.filter((f): f is CrmFeature => isCrmFeature(f))
  );
  return CRM_FEATURES.filter((f) => set.has(f));
}

/**
 * Resolve features for a user.
 * If `list` is missing/undefined (legacy docs), derive from role.
 * If `list` is an array (including empty), use sanitized list.
 */
export function normalizeFeatures(
  list: unknown,
  role: UserRole
): CrmFeature[] {
  if (list === undefined || list === null) {
    return defaultFeaturesForRole(role);
  }
  return sanitizeFeatures(list);
}

export function defaultFeaturesForRole(role: UserRole): CrmFeature[] {
  if (role === "compliance_admin") return [...DEFAULT_ADMIN_FEATURES];
  if (role === "compliance_user") return [...DEFAULT_COMPLIANCE_USER_FEATURES];
  return [];
}

export function canAccessFeature(
  features: readonly string[],
  feature: string
): boolean {
  return features.includes(feature);
}

export function hasAdminFeature(features: readonly string[]): boolean {
  return features.includes("admin");
}

export function hasCrmFeatures(features: readonly string[]): boolean {
  return features.length > 0;
}
