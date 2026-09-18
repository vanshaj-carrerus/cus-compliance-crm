import { connectDB } from "@/lib/mongodb";
import { User } from "@/lib/models/User";
import { canAccessCrm, normalizeRole } from "@/lib/roles";
import { corsPreflightResponse, jsonWithCors } from "@/lib/cors";

export const dynamic = "force-dynamic";

export async function OPTIONS(request: Request) {
  return corsPreflightResponse(request);
}

/**
 * Compliance admins/users who can be picked in "Assigned To" dropdowns.
 * Gated by middleware (canAccessCrm) like the rest of /api/*.
 */
export async function GET(request: Request) {
  try {
    await connectDB();
    const users = await User.find().lean();
    const assignees = users
      .filter((u) => canAccessCrm(normalizeRole(u.role)))
      .map((u) => u.name?.trim() || u.email.split("@")[0])
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b));

    return jsonWithCors(request, {
      assignees: [...new Set(assignees)],
    });
  } catch (error) {
    console.error("crm/assignees GET error:", error);
    return jsonWithCors(
      request,
      { error: "Failed to list assignees" },
      { status: 500 }
    );
  }
}
