import { NextResponse } from "next/server";
import { clearAuthCookies } from "@/lib/auth";

export async function POST() {
  const res = NextResponse.json({ message: "Signed out" });
  clearAuthCookies(res);
  return res;
}
