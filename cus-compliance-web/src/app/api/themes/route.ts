import { promises as fs } from "fs";
import path from "path";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const IMAGE_EXT = new Set([".png", ".jpg", ".jpeg", ".webp", ".avif", ".gif"]);
const VIDEO_EXT = new Set([".mp4", ".webm", ".ogv", ".mov"]);

/** Read-only: lists wallpaper files dropped into public/themes. */
export async function GET() {
  const dir = path.join(process.cwd(), "public", "themes");
  try {
    const names = await fs.readdir(dir);
    const items = names
      .map((name) => {
        const ext = path.extname(name).toLowerCase();
        const kind = IMAGE_EXT.has(ext)
          ? "image"
          : VIDEO_EXT.has(ext)
            ? "video"
            : null;
        return kind
          ? {
              name: path.basename(name, path.extname(name)),
              url: "/themes/" + encodeURIComponent(name),
              kind,
            }
          : null;
      })
      .filter((x): x is { name: string; url: string; kind: string } => !!x)
      .sort((a, b) =>
        a.name.localeCompare(b.name, undefined, { numeric: true })
      );
    return NextResponse.json({ items });
  } catch {
    return NextResponse.json({ items: [] });
  }
}
