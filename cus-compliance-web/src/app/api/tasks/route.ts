import { connectDB } from "@/lib/mongodb";
import { TaskModel } from "@/lib/models/Task";
import { requireCrmAccess } from "@/lib/session-user";
import { corsPreflightResponse, jsonWithCors } from "@/lib/cors";
import { publicTask, TASK_LIMIT, TASK_MAX_LENGTH, type TaskLean } from "@/lib/tasks";

export const dynamic = "force-dynamic";

export async function OPTIONS(request: Request) {
  return corsPreflightResponse(request);
}

/** Everyone with CRM access sees the same list (urgent first, then oldest). */
export async function GET(request: Request) {
  try {
    const auth = await requireCrmAccess(request);
    if ("error" in auth) {
      return jsonWithCors(request, { error: auth.error }, { status: auth.status });
    }
    await connectDB();
    const docs = (await TaskModel.find({})
      .sort({ urgent: -1, createdAt: 1 })
      .limit(TASK_LIMIT)
      .lean()) as TaskLean[];
    return jsonWithCors(request, { tasks: docs.map(publicTask) });
  } catch (e) {
    console.error(e);
    return jsonWithCors(
      request,
      { error: e instanceof Error ? e.message : "Failed to load tasks" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireCrmAccess(request);
    if ("error" in auth) {
      return jsonWithCors(request, { error: auth.error }, { status: auth.status });
    }
    const body = (await request.json().catch(() => ({}))) as {
      text?: unknown;
      urgent?: unknown;
    };
    const text = String(body.text ?? "").replace(/\s+/g, " ").trim();
    if (!text) {
      return jsonWithCors(request, { error: "Task text is required" }, { status: 400 });
    }
    if (text.length > TASK_MAX_LENGTH) {
      return jsonWithCors(
        request,
        { error: `Task is too long (max ${TASK_MAX_LENGTH} characters)` },
        { status: 400 }
      );
    }
    await connectDB();
    if ((await TaskModel.countDocuments({})) >= TASK_LIMIT) {
      return jsonWithCors(
        request,
        { error: `Task list is full (max ${TASK_LIMIT}). Remove some first.` },
        { status: 400 }
      );
    }
    const doc = await TaskModel.create({
      text,
      urgent: body.urgent === true,
      createdBy: auth.user.name,
      updatedBy: auth.user.name,
    });
    return jsonWithCors(request, { task: publicTask(doc.toObject() as TaskLean) });
  } catch (e) {
    console.error(e);
    return jsonWithCors(
      request,
      { error: e instanceof Error ? e.message : "Failed to add task" },
      { status: 500 }
    );
  }
}
