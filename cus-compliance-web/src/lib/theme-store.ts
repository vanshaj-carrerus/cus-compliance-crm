import { BODY_WEIGHTS, HEADING_WEIGHTS, isFontId } from "./fonts";

/**
 * Browser-only appearance preferences (theme, wallpaper, glass, icon colour).
 * Stored in localStorage; nothing is sent to the server.
 */
export type WallpaperKind = "image" | "video" | "gradient";

export interface ThemeSettings {
  /** "/themes/x.png" | "/themes/x.mp4" | "gradient:<id>" */
  wallpaper: string;
  kind: WallpaperKind;
  /** backdrop blur of glass panels, px */
  blur: number;
  /** white fill of glass panels, 0–0.4 */
  fill: number;
  /** dark overlay on the wallpaper, 0–0.7 */
  dim: number;
  /** accent / icon colour: "" = multicolour, otherwise #rrggbb */
  accent: string;
  /** font family ids (see fonts.ts); "default" = the app's own font */
  headFont: string;
  bodyFont: string;
  /** size multipliers: body text 0.8-1.4, headings 0.8-1.6 (1 = normal) */
  textScale: number;
  headScale: number;
  /** font weights; 0 = keep the app's own weights */
  bodyWeight: number;
  headWeight: number;
}

export const TEXT_SCALE_RANGE = { min: 0.8, max: 1.4, step: 0.05 };
export const HEAD_SCALE_RANGE = { min: 0.8, max: 1.6, step: 0.05 };

/** Code-drawn wallpapers (no files needed). */
export const GRADIENTS: Record<string, { label: string; css: string }> = {
  aurora: {
    label: "Aurora",
    css: "radial-gradient(900px 600px at 12% 8%, rgba(70,220,190,.55), transparent 60%), radial-gradient(800px 600px at 90% 20%, rgba(90,130,255,.5), transparent 60%), radial-gradient(900px 700px at 60% 105%, rgba(60,190,230,.45), transparent 60%), linear-gradient(160deg, #0f5f7a, #1d6fa5 45%, #2c5aa8)",
  },
  sunset: {
    label: "Sunset",
    css: "radial-gradient(800px 600px at 85% 10%, rgba(255,160,90,.6), transparent 60%), radial-gradient(900px 700px at 10% 95%, rgba(255,100,160,.5), transparent 60%), radial-gradient(700px 500px at 50% 50%, rgba(170,90,230,.35), transparent 65%), linear-gradient(160deg, #3d2a8f, #8a3fa8 50%, #d2587f)",
  },
  midnight: {
    label: "Midnight",
    css: "radial-gradient(900px 600px at 20% 0%, rgba(100,90,255,.4), transparent 60%), radial-gradient(900px 700px at 100% 100%, rgba(60,120,255,.28), transparent 60%), linear-gradient(165deg, #0c1033, #171a4d 55%, #23205e)",
  },
  ocean: {
    label: "Ocean",
    css: "radial-gradient(900px 600px at 80% 0%, rgba(90,220,255,.5), transparent 60%), radial-gradient(900px 700px at 0% 100%, rgba(40,110,230,.5), transparent 60%), linear-gradient(160deg, #0b4f9c, #1b7ac4 50%, #2aa0d8)",
  },
  forest: {
    label: "Forest",
    css: "radial-gradient(900px 600px at 15% 5%, rgba(120,230,150,.4), transparent 60%), radial-gradient(900px 700px at 100% 100%, rgba(40,150,120,.45), transparent 60%), linear-gradient(160deg, #0d4a3a, #17694f 50%, #2a8a62)",
  },
};

export interface ThemePreset {
  id: string;
  name: string;
  wallpaper: string;
  kind: WallpaperKind;
  blur: number;
  fill: number;
  dim: number;
  accent: string;
  /** file-based presets only show once the file exists in public/themes */
  requires?: string;
}

export const THEME_PRESETS: ThemePreset[] = [
  { id: "bubbles", name: "Bubbles", wallpaper: "/themes/background1.png", kind: "image", blur: 3, fill: 0.1, dim: 0, accent: "", requires: "/themes/background1.png" },
  { id: "aurora", name: "Aurora", wallpaper: "gradient:aurora", kind: "gradient", blur: 6, fill: 0.12, dim: 0, accent: "#2fd1b0" },
  { id: "sunset", name: "Sunset", wallpaper: "gradient:sunset", kind: "gradient", blur: 6, fill: 0.12, dim: 0, accent: "#ff8a5c" },
  { id: "ocean", name: "Ocean", wallpaper: "gradient:ocean", kind: "gradient", blur: 6, fill: 0.12, dim: 0, accent: "#4fc3ff" },
  { id: "forest", name: "Forest", wallpaper: "gradient:forest", kind: "gradient", blur: 6, fill: 0.12, dim: 0, accent: "#6fe3a0" },
  { id: "midnight", name: "Midnight", wallpaper: "gradient:midnight", kind: "gradient", blur: 10, fill: 0.08, dim: 0, accent: "#8b7cff" },
];

export const ACCENT_PRESETS: { label: string; value: string }[] = [
  { label: "Blue", value: "#4f7df5" },
  { label: "Violet", value: "#7c5cf0" },
  { label: "Pink", value: "#ee5fa7" },
  { label: "Red", value: "#ee4f5f" },
  { label: "Orange", value: "#f08a2c" },
  { label: "Green", value: "#1fb57d" },
  { label: "Teal", value: "#1fa8c8" },
  { label: "White", value: "#e9eeff" },
];

export const GLASS_PRESETS: {
  id: string;
  label: string;
  blur: number;
  fill: number;
  dim: number;
}[] = [
  { id: "clear", label: "Clear", blur: 3, fill: 0.1, dim: 0 },
  { id: "soft", label: "Soft", blur: 10, fill: 0.16, dim: 0.05 },
  { id: "frosted", label: "Frosted", blur: 20, fill: 0.24, dim: 0.1 },
  { id: "night", label: "Night", blur: 8, fill: 0.08, dim: 0.4 },
];

export const DEFAULT_PRESET = THEME_PRESETS[0];

export const DEFAULT_THEME: ThemeSettings = {
  wallpaper: DEFAULT_PRESET.wallpaper,
  kind: DEFAULT_PRESET.kind,
  blur: DEFAULT_PRESET.blur,
  fill: DEFAULT_PRESET.fill,
  dim: DEFAULT_PRESET.dim,
  accent: DEFAULT_PRESET.accent,
  headFont: "default",
  bodyFont: "default",
  textScale: 1,
  headScale: 1,
  bodyWeight: 0,
  headWeight: 0,
};

/** The typography part of the theme, for "reset typography". */
export const DEFAULT_TYPOGRAPHY = {
  headFont: DEFAULT_THEME.headFont,
  bodyFont: DEFAULT_THEME.bodyFont,
  textScale: DEFAULT_THEME.textScale,
  headScale: DEFAULT_THEME.headScale,
  bodyWeight: DEFAULT_THEME.bodyWeight,
  headWeight: DEFAULT_THEME.headWeight,
};

const KEY = "crm.theme.v2";
const listeners = new Set<() => void>();
let cache: ThemeSettings = DEFAULT_THEME;
let loaded = false;

function clamp(n: unknown, min: number, max: number, fallback: number) {
  const v = Number(n);
  return Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : fallback;
}

function sanitize(raw: unknown): ThemeSettings {
  const r = (raw && typeof raw === "object" ? raw : {}) as Partial<ThemeSettings>;
  let wallpaper = DEFAULT_THEME.wallpaper;
  let kind: WallpaperKind = DEFAULT_THEME.kind;
  if (typeof r.wallpaper === "string") {
    if (r.wallpaper.startsWith("gradient:") && GRADIENTS[r.wallpaper.slice(9)]) {
      wallpaper = r.wallpaper;
      kind = "gradient";
    } else if (r.wallpaper.startsWith("/")) {
      wallpaper = r.wallpaper;
      kind = r.kind === "video" ? "video" : "image";
    }
  }
  return {
    wallpaper,
    kind,
    blur: clamp(r.blur, 0, 30, DEFAULT_THEME.blur),
    fill: clamp(r.fill, 0, 0.4, DEFAULT_THEME.fill),
    dim: clamp(r.dim, 0, 0.7, DEFAULT_THEME.dim),
    accent:
      typeof r.accent === "string" && /^#[0-9a-fA-F]{6}$/.test(r.accent)
        ? r.accent
        : "",
    headFont: isFontId(r.headFont) ? r.headFont : DEFAULT_THEME.headFont,
    bodyFont: isFontId(r.bodyFont) ? r.bodyFont : DEFAULT_THEME.bodyFont,
    textScale: clamp(r.textScale, TEXT_SCALE_RANGE.min, TEXT_SCALE_RANGE.max, 1),
    headScale: clamp(r.headScale, HEAD_SCALE_RANGE.min, HEAD_SCALE_RANGE.max, 1),
    bodyWeight: BODY_WEIGHTS.some((w) => w.value === r.bodyWeight) ? Number(r.bodyWeight) : 0,
    headWeight: HEADING_WEIGHTS.some((w) => w.value === r.headWeight) ? Number(r.headWeight) : 0,
  };
}

function load() {
  if (loaded || typeof window === "undefined") return;
  loaded = true;
  try {
    const s = window.localStorage.getItem(KEY);
    if (s) cache = sanitize(JSON.parse(s));
  } catch {
    /* storage unavailable — keep defaults */
  }
  window.addEventListener("storage", (e) => {
    if (e.key !== KEY) return;
    try {
      cache = e.newValue ? sanitize(JSON.parse(e.newValue)) : DEFAULT_THEME;
    } catch {
      cache = DEFAULT_THEME;
    }
    listeners.forEach((l) => l());
  });
}

export function getTheme(): ThemeSettings {
  load();
  return cache;
}

export function getServerTheme(): ThemeSettings {
  return DEFAULT_THEME;
}

export function setTheme(patch: Partial<ThemeSettings>) {
  load();
  cache = sanitize({ ...cache, ...patch });
  try {
    window.localStorage.setItem(KEY, JSON.stringify(cache));
  } catch {
    /* ignore quota / private mode */
  }
  listeners.forEach((l) => l());
}

/** Apply a whole built-in theme (wallpaper + glass + icon colour) at once. */
export function applyPreset(p: ThemePreset) {
  setTheme({
    wallpaper: p.wallpaper,
    kind: p.kind,
    blur: p.blur,
    fill: p.fill,
    dim: p.dim,
    accent: p.accent,
  });
}

export function presetMatches(p: ThemePreset, t: ThemeSettings) {
  return (
    p.wallpaper === t.wallpaper &&
    p.blur === t.blur &&
    Math.abs(p.fill - t.fill) < 0.005 &&
    Math.abs(p.dim - t.dim) < 0.005 &&
    p.accent === t.accent
  );
}

export function resetTheme() {
  load();
  cache = DEFAULT_THEME;
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
  listeners.forEach((l) => l());
}

export function subscribeTheme(cb: () => void) {
  load();
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}
