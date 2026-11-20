import mongoose from "mongoose";
import { connectDB } from "@/lib/mongodb";
import { TaskModel } from "@/lib/models/Task";
import { requireCrmAccess } from "@/lib/session-user";
import { corsPreflightResponse, jsonWithCors } from "@/lib/cors";
import { publicTask, TASK_MAX_LENGTH, type TaskLean } from "@/lib/tasks";

export const dynamic = "force-dynamic";

type RouteCtx = { params: Promise<{ id: string }> };

export async function OPTIONS(request: Request) {
  return corsPreflightResponse(request);
}

/** Edit the text and/or the urgent flag. Any CRM user may edit any task. */
export async function PATCH(request: Request, ctx: RouteCtx) {
  try {
    const auth = await requireCrmAccess(request);
    if ("error" in auth) {
      return jsonWithCors(request, { error: auth.error }, { status: auth.status });
    }
    const { id } = await ctx.params;
    if (!mongoose.isValidObjectId(id)) {
      return jsonWithCors(request, { error: "Task not found" }, { status: 404 });
    }
    const body = (await request.json().catch(() => ({}))) as {
      text?: unknown;
      urgent?: unknown;
    };
    const update: Record<string, unknown> = { updatedBy: auth.user.name };
    if (body.text !== undefined) {
      const text = String(body.text).replace(/\s+/g, " ").trim();
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
      update.text = text;
    }
    if (body.urgent !== undefined) update.urgent = body.urgent === true;

    await connectDB();
    const doc = await TaskModel.findByIdAndUpdate(id, update, { new: true }).lean();
    if (!doc) {
      return jsonWithCors(request, { error: "Task not found" }, { status: 404 });
    }
    return jsonWithCors(request, { task: publicTask(doc as TaskLean) });
  } catch (e) {
    console.error(e);
    return jsonWithCors(
      request,
      { error: e instanceof Error ? e.message : "Failed to update task" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request, ctx: RouteCtx) {
  try {
    const auth = await requireCrmAccess(request);
    if ("error" in auth) {
      return jsonWithCors(request, { error: auth.error }, { status: auth.status });
    }
    const { id } = await ctx.params;
    if (!mongoose.isValidObjectId(id)) {
      return jsonWithCors(request, { ok: true });
    }
    await connectDB();
    await TaskModel.findByIdAndDelete(id);
    return jsonWithCors(request, { ok: true });
  } catch (e) {
    console.error(e);
    return jsonWithCors(
      request,
      { error: e instanceof Error ? e.message : "Failed to delete task" },
      { status: 500 }
    );
  }
}
