import { NextResponse } from "next/server";

const DEFAULT_ORIGINS = [
  "https://cus-compliance-crm.vercel.app",
  "http://localhost:3000",
  "http://localhost:1420",
  "http://127.0.0.1:1420",
  "https://tauri.localhost",
  "http://tauri.localhost",
  "tauri://localhost",
];

export function getAllowedOrigins(): string[] {
  const fromEnv = String(process.env.CORS_ALLOWED_ORIGINS || "")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);
  return [...new Set([...DEFAULT_ORIGINS, ...fromEnv])];
}

export function resolveCorsOrigin(request: Request): string | null {
  const origin = request.headers.get("origin");
  if (!origin) return null;
  const allowed = getAllowedOrigins();
  if (allowed.includes(origin) || allowed.includes("*")) return origin;
  return null;
}

export function applyCorsHeaders(
  request: Request,
  response: NextResponse
): NextResponse {
  const origin = resolveCorsOrigin(request);
  if (origin) {
    response.headers.set("Access-Control-Allow-Origin", origin);
    response.headers.set("Access-Control-Allow-Credentials", "true");
    response.headers.set("Vary", "Origin");
  }
  response.headers.set(
    "Access-Control-Allow-Methods",
    "GET,POST,PUT,PATCH,DELETE,OPTIONS"
  );
  response.headers.set(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization"
  );
  response.headers.set("Access-Control-Max-Age", "86400");
  return response;
}

export function corsPreflightResponse(request: Request): NextResponse {
  return applyCorsHeaders(request, new NextResponse(null, { status: 204 }));
}

export function jsonWithCors(
  request: Request,
  body: unknown,
  init?: ResponseInit
): NextResponse {
  return applyCorsHeaders(request, NextResponse.json(body, init));
}
