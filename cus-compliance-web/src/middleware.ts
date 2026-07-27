import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth-edge";
import { applyCorsHeaders, corsPreflightResponse } from "@/lib/cors";
import { canAccessCrm, normalizeRole } from "@/lib/roles";

const PUBLIC_PATHS = ["/login"];
const PUBLIC_API_PREFIXES = [
  "/api/auth/send-code",
  "/api/auth/verify-code",
  "/api/auth/login",
  "/api/auth/set-password",
  "/api/auth/reset-password",
  "/api/auth/logout",
  "/api/auth/me",
];

function isPublic(pathname: string) {
  if (PUBLIC_PATHS.includes(pathname)) return true;
  return PUBLIC_API_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(p + "/")
  );
}

function getBearerToken(request: NextRequest): string | null {
  const header = request.headers.get("authorization") || "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname.startsWith("/api/") && request.method === "OPTIONS") {
    return corsPreflightResponse(request);
  }

  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    pathname.includes(".")
  ) {
    return NextResponse.next();
  }

  const cookieToken = request.cookies.get(SESSION_COOKIE)?.value;
  const bearerToken = getBearerToken(request);
  const session = cookieToken
    ? await verifySessionToken(cookieToken)
    : bearerToken
      ? await verifySessionToken(bearerToken)
      : null;
  const authed = Boolean(session);

  if (pathname === "/login") {
    if (authed) {
      return NextResponse.redirect(new URL("/dashboard", request.url));
    }
    return NextResponse.next();
  }

  if (isPublic(pathname)) {
    const res = NextResponse.next();
    return pathname.startsWith("/api/") ? applyCorsHeaders(request, res) : res;
  }

  if (!authed || !session) {
    if (pathname.startsWith("/api/")) {
      return applyCorsHeaders(
        request,
        NextResponse.json({ error: "Unauthorized" }, { status: 401 })
      );
    }
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  const role = normalizeRole(session.role);

  // Any signed-in user may submit/check their own access request.
  if (
    pathname === "/api/access-requests" ||
    pathname.startsWith("/api/access-requests/")
  ) {
    const res = NextResponse.next();
    return applyCorsHeaders(request, res);
  }

  // Admin APIs: soft role gate; requireAdmin (DB features) is source of truth.
  if (pathname.startsWith("/api/admin")) {
    if (!canAccessCrm(role)) {
      return applyCorsHeaders(
        request,
        NextResponse.json({ error: "Forbidden" }, { status: 403 })
      );
    }
  } else if (
    pathname.startsWith("/api/") &&
    !pathname.startsWith("/api/auth")
  ) {
    if (!canAccessCrm(role)) {
      return applyCorsHeaders(
        request,
        NextResponse.json({ error: "Forbidden" }, { status: 403 })
      );
    }
  }

  const res = NextResponse.next();
  return pathname.startsWith("/api/") ? applyCorsHeaders(request, res) : res;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
