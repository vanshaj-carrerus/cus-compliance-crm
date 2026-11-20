import mongoose from "mongoose";
import { NextResponse } from "next/server";
import { requireCrmAccess } from "@/lib/session-user";
import { applyCorsHeaders, corsPreflightResponse, jsonWithCors } from "@/lib/cors";
import { getWallpaperBucket } from "@/lib/wallpaper-store";

export const dynamic = "force-dynamic";

type RouteCtx = { params: Promise<{ id: string }> };

export async function OPTIONS(request: Request) {
  return corsPreflightResponse(request);
}

/** Looks the file up - only if it belongs to the signed-in user. */
async function findOwned(request: Request, id: string) {
  const auth = await requireCrmAccess(request);
  if ("error" in auth) {
    return { res: jsonWithCors(request, { error: auth.error }, { status: auth.status }) };
  }
  if (!mongoose.isValidObjectId(id)) {
    return { res: jsonWithCors(request, { error: "Not found" }, { status: 404 }) };
  }
  const bucket = await getWallpaperBucket();
  const _id = new mongoose.Types.ObjectId(id);
  const [file] = await bucket
    .find({ _id, "metadata.ownerId": auth.user.id })
    .limit(1)
    .toArray();
  if (!file) {
    return { res: jsonWithCors(request, { error: "Not found" }, { status: 404 }) };
  }
  return { bucket, file, _id };
}

/** Streams the image back (only to the user who uploaded it). */
export async function GET(request: Request, ctx: RouteCtx) {
  try {
    const { id } = await ctx.params;
    const found = await findOwned(request, id);
    if ("res" in found) return found.res;
    const { bucket, file, _id } = found;

    const etag = `"${String(file._id)}"`;
    const headers: Record<string, string> = {
      ETag: etag,
      "Cache-Control": "private, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
    };
    if (request.headers.get("if-none-match") === etag) {
      return applyCorsHeaders(request, new NextResponse(null, { status: 304, headers }));
    }

    const chunks: Buffer[] = [];
    for await (const chunk of bucket.openDownloadStream(_id)) {
      chunks.push(chunk as Buffer);
    }
    const body = Buffer.concat(chunks);
    const contentType =
      String((file.metadata as { contentType?: string } | undefined)?.contentType || "") ||
      "application/octet-stream";
    return applyCorsHeaders(
      request,
      new NextResponse(new Uint8Array(body), {
        status: 200,
        headers: {
          ...headers,
          "Content-Type": contentType,
          "Content-Length": String(body.length),
        },
      })
    );
  } catch (e) {
    console.error(e);
    return jsonWithCors(
      request,
      { error: e instanceof Error ? e.message : "Failed to load wallpaper" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request, ctx: RouteCtx) {
  try {
    const { id } = await ctx.params;
    const found = await findOwned(request, id);
    if ("res" in found) return found.res;
    await found.bucket.delete(found._id);
    return jsonWithCors(request, { ok: true });
  } catch (e) {
    console.error(e);
    return jsonWithCors(
      request,
      { error: e instanceof Error ? e.message : "Failed to delete wallpaper" },
      { status: 500 }
    );
  }
}
