import { clearAuthCookies } from "@/lib/auth";
import { corsPreflightResponse, jsonWithCors } from "@/lib/cors";

export async function OPTIONS(request: Request) {
  return corsPreflightResponse(request);
}

export async function POST(request: Request) {
  const res = jsonWithCors(request, { message: "Signed out" });
  clearAuthCookies(res);
  return res;
}
