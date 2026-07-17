import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth-edge";
import { applyCorsHeaders, corsPreflightResponse } from "@/lib/cors";

const PUBLIC_PATHS = ["/login"];
const PUBLIC_API_PREFIXES = [
  "/api/auth/send-code",
  "/api/auth/verify-code",
  "/api/auth/login",
  "/api/auth/set-password",
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

  if (!authed) {
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

  const res = NextResponse.next();
  return pathname.startsWith("/api/") ? applyCorsHeaders(request, res) : res;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
