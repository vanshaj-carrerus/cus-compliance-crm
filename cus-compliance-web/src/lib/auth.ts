import { cookies } from "next/headers";
import type { NextRequest, NextResponse } from "next/server";
import {
  SESSION_COOKIE,
  VERIFIED_COOKIE,
  type SessionPayload,
  type VerifiedPayload,
  normalizeEmail,
  isValidEmail,
  getAllowedEmails,
  isEmailAllowed,
  signSessionToken,
  signVerifiedToken,
  verifySessionToken,
  verifyVerifiedToken,
} from "./auth-edge";

export {
  SESSION_COOKIE,
  VERIFIED_COOKIE,
  normalizeEmail,
  isValidEmail,
  getAllowedEmails,
  isEmailAllowed,
  signSessionToken,
  signVerifiedToken,
  verifySessionToken,
  verifyVerifiedToken,
};
export type { SessionPayload, VerifiedPayload };

const cookieBase = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
};

export function setSessionCookie(res: NextResponse, token: string) {
  res.cookies.set(SESSION_COOKIE, token, {
    ...cookieBase,
    maxAge: 60 * 60 * 24 * 7,
  });
}

export function setVerifiedCookie(res: NextResponse, token: string) {
  res.cookies.set(VERIFIED_COOKIE, token, {
    ...cookieBase,
    maxAge: 60 * 15,
  });
}

export function clearAuthCookies(res: NextResponse) {
  res.cookies.set(SESSION_COOKIE, "", { ...cookieBase, maxAge: 0 });
  res.cookies.set(VERIFIED_COOKIE, "", { ...cookieBase, maxAge: 0 });
}

export function getBearerToken(request: Request | NextRequest): string | null {
  const header = request.headers.get("authorization") || "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

export async function getSessionFromCookies(): Promise<SessionPayload | null> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return verifySessionToken(token);
}

export async function getVerifiedFromCookies(): Promise<VerifiedPayload | null> {
  const jar = await cookies();
  const token = jar.get(VERIFIED_COOKIE)?.value;
  if (!token) return null;
  return verifyVerifiedToken(token);
}

/** Cookie session or Authorization Bearer session token. */
export async function getSessionFromRequest(
  req: Request | NextRequest
): Promise<SessionPayload | null> {
  const bearer = getBearerToken(req);
  if (bearer) return verifySessionToken(bearer);

  if ("cookies" in req && typeof req.cookies?.get === "function") {
    const token = req.cookies.get(SESSION_COOKIE)?.value;
    if (token) return verifySessionToken(token);
  }

  return getSessionFromCookies();
}

/** Cookie verified-step or body/header verifiedToken for desktop clients. */
export async function getVerifiedFromRequest(
  req: Request | NextRequest,
  bodyToken?: string | null
): Promise<VerifiedPayload | null> {
  const bearer = getBearerToken(req);
  if (bearer) {
    const fromBearer = await verifyVerifiedToken(bearer);
    if (fromBearer) return fromBearer;
  }

  if (bodyToken) {
    const fromBody = await verifyVerifiedToken(bodyToken);
    if (fromBody) return fromBody;
  }

  if ("cookies" in req && typeof req.cookies?.get === "function") {
    const token = req.cookies.get(VERIFIED_COOKIE)?.value;
    if (token) return verifyVerifiedToken(token);
  }

  return getVerifiedFromCookies();
}
