import { requireCrmAccess } from "@/lib/session-user";
import { corsPreflightResponse, jsonWithCors } from "@/lib/cors";
import {
  cleanWallpaperName,
  getWallpaperBucket,
  sniffImage,
  WALLPAPER_MAX_BYTES,
  WALLPAPER_MAX_PER_USER,
} from "@/lib/wallpaper-store";

export const dynamic = "force-dynamic";

const TOO_LARGE = `Image is too large (max ${WALLPAPER_MAX_BYTES / 1024 / 1024} MB)`;

export async function OPTIONS(request: Request) {
  return corsPreflightResponse(request);
}

/** The signed-in user's own uploaded wallpapers. */
export async function GET(request: Request) {
  try {
    const auth = await requireCrmAccess(request);
    if ("error" in auth) {
      return jsonWithCors(request, { error: auth.error }, { status: auth.status });
    }
    const bucket = await getWallpaperBucket();
    const files = await bucket
      .find({ "metadata.ownerId": auth.user.id })
      .sort({ uploadDate: 1 })
      .toArray();
    const items = files.map((f) => ({
      id: String(f._id),
      name: String((f.metadata as { name?: string } | undefined)?.name || f.filename),
      url: `/api/wallpapers/${String(f._id)}`,
      kind: "image" as const,
      size: f.length,
    }));
    return jsonWithCors(request, { items, max: WALLPAPER_MAX_PER_USER });
  } catch (e) {
    console.error(e);
    return jsonWithCors(
      request,
      { error: e instanceof Error ? e.message : "Failed to load wallpapers" },
      { status: 500 }
    );
  }
}

/**
 * Upload one image. The raw file is the request body (Content-Type is the
 * image type, `x-file-name` its URI-encoded name) - it is validated, then
 * written to GridFS, which stores it in chunks.
 */
export async function POST(request: Request) {
  try {
    const auth = await requireCrmAccess(request);
    if ("error" in auth) {
      return jsonWithCors(request, { error: auth.error }, { status: auth.status });
    }
    const declared = Number(request.headers.get("content-length") || 0);
    if (declared > WALLPAPER_MAX_BYTES) {
      return jsonWithCors(request, { error: TOO_LARGE }, { status: 413 });
    }
    if (!request.body) {
      return jsonWithCors(request, { error: "No image received" }, { status: 400 });
    }

    // Read the body with a hard size cap (do not trust Content-Length).
    const reader = request.body.getReader();
    const parts: Uint8Array[] = [];
    let size = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > WALLPAPER_MAX_BYTES) {
        await reader.cancel().catch(() => {});
        return jsonWithCors(request, { error: TOO_LARGE }, { status: 413 });
      }
      parts.push(value);
    }
    if (size === 0) {
      return jsonWithCors(request, { error: "No image received" }, { status: 400 });
    }
    const data = Buffer.concat(parts, size);
    const kind = sniffImage(data);
    if (!kind) {
      return jsonWithCors(
        request,
        { error: "Unsupported file. Use a PNG, JPG, WebP, AVIF or GIF image." },
        { status: 415 }
      );
    }

    const bucket = await getWallpaperBucket();
    const owned = await bucket
      .find({ "metadata.ownerId": auth.user.id })
      .project({ _id: 1 })
      .toArray();
    if (owned.length >= WALLPAPER_MAX_PER_USER) {
      return jsonWithCors(
        request,
        {
          error: `You can keep up to ${WALLPAPER_MAX_PER_USER} wallpapers. Delete one to add another.`,
        },
        { status: 400 }
      );
    }

    const name = cleanWallpaperName(request.headers.get("x-file-name"));
    const id = await new Promise<string>((resolve, reject) => {
      const up = bucket.openUploadStream(`${name}.${kind.ext}`, {
        metadata: {
          ownerId: auth.user.id,
          name,
          contentType: kind.mime,
        },
      });
      up.once("error", reject);
      up.once("finish", () => resolve(String(up.id)));
      up.end(data);
    });

    return jsonWithCors(request, {
      item: {
        id,
        name,
        url: `/api/wallpapers/${id}`,
        kind: "image" as const,
        size,
      },
    });
  } catch (e) {
    console.error(e);
    return jsonWithCors(
      request,
      { error: e instanceof Error ? e.message : "Failed to upload wallpaper" },
      { status: 500 }
    );
  }
}
