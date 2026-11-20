import mongoose from "mongoose";
import { connectDB } from "@/lib/mongodb";

/**
 * Custom wallpapers live in MongoDB GridFS: every image is split into
 * 255 KB chunks (collections wallpapers.files + wallpapers.chunks), and each
 * file records the user who uploaded it - users only ever see their own.
 */
export const WALLPAPER_BUCKET = "wallpapers";
export const WALLPAPER_CHUNK_BYTES = 255 * 1024;
export const WALLPAPER_MAX_BYTES = 8 * 1024 * 1024;
export const WALLPAPER_MAX_PER_USER = 12;

export async function getWallpaperBucket() {
  await connectDB();
  const db = mongoose.connection.db;
  if (!db) throw new Error("Database not connected");
  return new mongoose.mongo.GridFSBucket(db, {
    bucketName: WALLPAPER_BUCKET,
    chunkSizeBytes: WALLPAPER_CHUNK_BYTES,
  });
}

/**
 * Identify an image from its first bytes (never trust the client's
 * Content-Type). SVG is deliberately not allowed - it can carry scripts.
 */
export function sniffImage(buf: Uint8Array): { mime: string; ext: string } | null {
  if (buf.length < 12) return null;
  const ascii = (from: number, to: number) =>
    String.fromCharCode(...Array.from(buf.subarray(from, to)));
  if (buf[0] === 0x89 && ascii(1, 4) === "PNG") return { mime: "image/png", ext: "png" };
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff)
    return { mime: "image/jpeg", ext: "jpg" };
  if (ascii(0, 4) === "GIF8") return { mime: "image/gif", ext: "gif" };
  if (ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP")
    return { mime: "image/webp", ext: "webp" };
  if (ascii(4, 8) === "ftyp" && /^avi[fs]$/.test(ascii(8, 12)))
    return { mime: "image/avif", ext: "avif" };
  return null;
}

export function cleanWallpaperName(raw: string | null | undefined): string {
  let name = "";
  try {
    name = decodeURIComponent(String(raw ?? ""));
  } catch {
    name = String(raw ?? "");
  }
  name = name
    .replace(/\.[a-z0-9]{2,5}$/i, "")
    .replace(/[\u0000-\u001f<>"'`\\/]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 60);
  return name || "My wallpaper";
}
