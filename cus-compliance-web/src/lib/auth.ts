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

export function getSessionFromRequest(
  req: NextRequest
): Promise<SessionPayload | null> {
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  if (!token) return Promise.resolve(null);
  return verifySessionToken(token);
}
