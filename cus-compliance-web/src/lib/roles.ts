export const USER_ROLES = [
  "compliance_admin",
  "compliance_user",
  "user",
] as const;

export type UserRole = (typeof USER_ROLES)[number];

export const ROLE_LABELS: Record<UserRole, string> = {
  compliance_admin: "Compliance Admin",
  compliance_user: "Compliance User",
  user: "Normal User",
};

export function isUserRole(value: unknown): value is UserRole {
  return (
    typeof value === "string" &&
    (USER_ROLES as readonly string[]).includes(value)
  );
}

/** Accounts without a role are normal users (no CRM access). */
export function normalizeRole(role: unknown): UserRole {
  if (isUserRole(role)) return role;
  return "user";
}

/** Role-based CRM eligibility (signup / reset). Page access uses features. */
export function canAccessCrm(role: UserRole): boolean {
  return role === "compliance_admin" || role === "compliance_user";
}

export function isComplianceAdmin(role: UserRole): boolean {
  return role === "compliance_admin";
}
