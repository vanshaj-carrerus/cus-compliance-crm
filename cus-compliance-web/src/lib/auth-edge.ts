import { SignJWT, jwtVerify } from "jose";
import { normalizeRole, type UserRole } from "./roles";
import { sanitizeFeatures, type CrmFeature } from "./features";

export const SESSION_COOKIE = "crm_session";
export const VERIFIED_COOKIE = "crm_verified";

export type SessionPayload = {
  sub: string;
  email: string;
  role: UserRole;
  /** Page features — kept in JWT so /api/auth/me can skip Mongo on warm loads. */
  features?: CrmFeature[];
};

export type VerifiedPayload = {
  email: string;
  purpose: "password_step";
};

function secretKey() {
  const secret = process.env.JWT_SECRET?.trim();
  if (!secret) throw new Error("JWT_SECRET is not set");
  return new TextEncoder().encode(secret);
}

export function normalizeEmail(email: string) {
  return String(email || "")
    .trim()
    .toLowerCase();
}

export function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/** Comma-separated ALLOWED_EMAILS in env. */
export function getAllowedEmails(): string[] {
  return String(process.env.ALLOWED_EMAILS || "")
    .split(",")
    .map((e) => normalizeEmail(e))
    .filter(Boolean);
}

export function isEmailAllowed(email: string) {
  const allowed = getAllowedEmails();
  if (!allowed.length) return false;
  return allowed.includes(normalizeEmail(email));
}

export async function signSessionToken(payload: SessionPayload) {
  const features = sanitizeFeatures(payload.features ?? []);
  return new SignJWT({
    email: payload.email,
    role: payload.role,
    features,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(payload.sub)
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(secretKey());
}

export async function signVerifiedToken(email: string) {
  return new SignJWT({
    email: normalizeEmail(email),
    purpose: "password_step",
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("15m")
    .sign(secretKey());
}

export async function verifySessionToken(
  token: string
): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey());
    const email = typeof payload.email === "string" ? payload.email : "";
    const sub = typeof payload.sub === "string" ? payload.sub : "";
    if (!email || !sub) return null;
    const features = Array.isArray(payload.features)
      ? sanitizeFeatures(payload.features)
      : undefined;
    return {
      email: normalizeEmail(email),
      sub,
      role: normalizeRole(payload.role),
      features,
    };
  } catch {
    return null;
  }
}

export async function verifyVerifiedToken(
  token: string
): Promise<VerifiedPayload | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey());
    const email = typeof payload.email === "string" ? payload.email : "";
    const purpose = payload.purpose;
    if (!email || purpose !== "password_step") return null;
    return { email: normalizeEmail(email), purpose: "password_step" };
  } catch {
    return null;
  }
}
