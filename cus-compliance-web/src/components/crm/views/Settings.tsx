"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  Check,
  ImageIcon,
  ImagePlus,
  Loader2,
  Palette,
  Play,
  RefreshCw,
  RotateCcw,
  SlidersHorizontal,
  Trash2,
  Type,
} from "lucide-react";
import {
  ACCENT_PRESETS,
  DEFAULT_THEME,
  DEFAULT_TYPOGRAPHY,
  GLASS_PRESETS,
  HEAD_SCALE_RANGE,
  TEXT_COLOR_PRESETS,
  TEXT_SCALE_RANGE,
  getServerTheme,
  getTheme,
  resetTheme,
  setTheme,
  subscribeTheme,
  type WallpaperKind,
} from "@/lib/theme-store";
import { BODY_WEIGHTS, FONT_OPTIONS, HEADING_WEIGHTS } from "@/lib/fonts";

interface WallpaperItem {
  name: string;
  url: string;
  kind: WallpaperKind;
}

/** A wallpaper the signed-in user uploaded (stored in MongoDB GridFS). */
interface MyWallpaper extends WallpaperItem {
  id: string;
  size: number;
}

const MY_WALLPAPER_PREFIX = "/api/wallpapers/";
const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;
const ACCEPT = "image/png,image/jpeg,image/webp,image/avif,image/gif";

async function apiError(res: Response, fallback: string) {
  try {
    const data = (await res.json()) as { error?: string };
    return data.error || fallback;
  } catch {
    return fallback;
  }
}

function FontSelect({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (id: string) => void;
}) {
  const groups = ["App", "Web fonts", "System fonts"] as const;
  return (
    <label className="st-field">
      <span>{label}</span>
      <select
        className="st-select"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {groups.map((g) => (
          <optgroup key={g} label={g}>
            {FONT_OPTIONS.filter((f) => f.group === g).map((f) => (
              <option key={f.id} value={f.id} style={f.stack ? { fontFamily: f.stack } : undefined}>
                {f.label}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
    </label>
  );
}

function WeightChips({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: number;
  options: { value: number; label: string }[];
  onChange: (v: number) => void;
}) {
  return (
    <div className="st-field">
      <span>{label}</span>
      <div className="st-weights" role="group" aria-label={label}>
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            className={`st-chip ${value === o.value ? "is-active" : ""}`}
            aria-pressed={value === o.value}
            style={o.value ? { fontWeight: o.value } : undefined}
            onClick={() => onChange(o.value)}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Text colour: "Default" (the app's own colours), quick picks, or any colour. */
function TextColorPicker({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (hex: string) => void;
}) {
  const current = value
    ? (TEXT_COLOR_PRESETS.find((c) => c.value === value)?.label ?? value.toUpperCase())
    : "Default";
  return (
    <div className="st-field">
      <span className="st-slider-top">
        <span>{label}</span>
        <b>{current}</b>
      </span>
      <div className="st-swatches st-text-swatches" role="group" aria-label={label}>
        <button
          type="button"
          className={`st-swatch is-default ${!value ? "is-active" : ""}`}
          title="Default"
          aria-label="Default colour"
          aria-pressed={!value}
          onClick={() => onChange("")}
        />
        {TEXT_COLOR_PRESETS.map((c) => (
          <button
            key={c.value}
            type="button"
            className={`st-swatch ${value === c.value ? "is-active" : ""}`}
            style={{ background: c.value }}
            title={c.label}
            aria-label={c.label}
            aria-pressed={value === c.value}
            onClick={() => onChange(c.value)}
          />
        ))}
        <label className="st-swatch is-picker" title="Custom colour">
          <input
            type="color"
            value={value || "#ffffff"}
            onChange={(e) => onChange(e.target.value)}
            aria-label={`Custom ${label.toLowerCase()}`}
          />
        </label>
      </div>
    </div>
  );
}

function Slider({
  label,
  value,
  min,
  max,
  step,
  unit,
  display,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit: string;
  display: number;
  onChange: (v: number) => void;
}) {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <label className="st-slider">
      <span className="st-slider-top">
        <span>{label}</span>
        <b>
          {display}
          {unit}
        </b>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        style={{ ["--pct" as string]: `${pct}%` }}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </label>
  );
}

export function SettingsPage() {
  const theme = useSyncExternalStore(subscribeTheme, getTheme, getServerTheme);
  const [items, setItems] = useState<WallpaperItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [mine, setMine] = useState<MyWallpaper[]>([]);
  const [mineMax, setMineMax] = useState(12);
  const [mineLoaded, setMineLoaded] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [mineError, setMineError] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/themes", { cache: "no-store" });
      const data = (await res.json()) as { items?: WallpaperItem[] };
      setItems(Array.isArray(data.items) ? data.items : []);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const loadMine = useCallback(async () => {
    try {
      const res = await fetch("/api/wallpapers", { cache: "no-store" });
      if (!res.ok) throw new Error(await apiError(res, "Could not load your wallpapers"));
      const data = (await res.json()) as { items?: MyWallpaper[]; max?: number };
      const list = Array.isArray(data.items) ? data.items : [];
      setMine(list);
      if (typeof data.max === "number") setMineMax(data.max);
      setMineError("");
      // The selected wallpaper may have been deleted elsewhere (or belong to
      // another account that used this browser) - fall back to the default.
      const cur = getTheme().wallpaper;
      if (cur.startsWith(MY_WALLPAPER_PREFIX) && !list.some((w) => w.url === cur)) {
        setTheme({ wallpaper: DEFAULT_THEME.wallpaper, kind: DEFAULT_THEME.kind });
      }
    } catch (e) {
      setMineError(e instanceof Error ? e.message : "Could not load your wallpapers");
    } finally {
      setMineLoaded(true);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadMine();
  }, [loadMine]);

  const uploadFiles = async (files: FileList | File[]) => {
    const list = Array.from(files);
    if (!list.length || uploading) return;
    setUploading(true);
    setMineError("");
    const problems: string[] = [];
    let count = mine.length;
    for (const file of list) {
      if (count >= mineMax) {
        problems.push(`You can keep up to ${mineMax} wallpapers - delete one to add more.`);
        break;
      }
      if (!/^image\/(png|jpe?g|webp|avif|gif)$/i.test(file.type)) {
        problems.push(`"${file.name}" isn't a PNG, JPG, WebP, AVIF or GIF image.`);
        continue;
      }
      if (file.size > MAX_UPLOAD_BYTES) {
        problems.push(`"${file.name}" is larger than ${MAX_UPLOAD_BYTES / 1024 / 1024} MB.`);
        continue;
      }
      try {
        const res = await fetch("/api/wallpapers", {
          method: "POST",
          headers: {
            "Content-Type": file.type,
            "x-file-name": encodeURIComponent(file.name),
          },
          body: file,
        });
        if (!res.ok) {
          problems.push(`"${file.name}": ${await apiError(res, "upload failed")}`);
          continue;
        }
        const data = (await res.json()) as { item: MyWallpaper };
        setMine((prev) => [...prev, data.item]);
        count += 1;
      } catch {
        problems.push(`"${file.name}": could not reach the server.`);
      }
    }
    setUploading(false);
    if (problems.length) setMineError(problems.join(" "));
    if (fileRef.current) fileRef.current.value = "";
  };

  const deleteMine = async (w: MyWallpaper) => {
    if (!confirm(`Delete the wallpaper "${w.name}"? This can't be undone.`)) return;
    setDeletingId(w.id);
    setMineError("");
    try {
      const res = await fetch(`/api/wallpapers/${w.id}`, { method: "DELETE" });
      if (!res.ok && res.status !== 404) {
        throw new Error(await apiError(res, "Could not delete the wallpaper"));
      }
      setMine((prev) => prev.filter((x) => x.id !== w.id));
      if (getTheme().wallpaper === w.url) {
        setTheme({ wallpaper: DEFAULT_THEME.wallpaper, kind: DEFAULT_THEME.kind });
      }
    } catch (e) {
      setMineError(e instanceof Error ? e.message : "Could not delete the wallpaper");
    } finally {
      setDeletingId(null);
    }
  };

  const all = items;
  const activePreset = GLASS_PRESETS.find(
    (p) =>
      p.blur === theme.blur &&
      Math.abs(p.fill - theme.fill) < 0.005 &&
      Math.abs(p.dim - theme.dim) < 0.005
  )?.id;

  return (
    <div className="dg st mx-auto w-full">
      <header className="dg-head dg-in" style={{ "--d": "0ms" } as React.CSSProperties}>
        <div className="min-w-0">
          <h1 className="dg-title">Settings</h1>
          <p className="dg-sub">
            Personalise your workspace. Theme choices are saved in this browser; uploaded wallpapers are saved to your account.
          </p>
        </div>
        <button
          type="button"
          className="st-ghost"
          onClick={() => resetTheme()}
        >
          <RotateCcw className="h-4 w-4" strokeWidth={2} /> Reset to default
        </button>
      </header>

      {/* ── Wallpaper ── */}
      <section
        className="dg-card st-card dg-in"
        style={{ "--d": "120ms" } as React.CSSProperties}
      >
        <div className="dg-card-head">
          <span className="dg-card-icon">
            <ImageIcon className="h-[18px] w-[18px]" strokeWidth={2} />
          </span>
          <h2 className="dg-card-title">
            Wallpaper <small>({items.length} in themes folder)</small>
          </h2>
          <button
            type="button"
            className="st-ghost ml-auto"
            onClick={() => void load()}
            disabled={loading}
            aria-label="Rescan themes folder"
          >
            <RefreshCw
              className={`h-4 w-4 ${loading ? "animate-spin" : ""}`}
              strokeWidth={2}
            />
            Rescan
          </button>
        </div>

        <div className="st-wall-grid">
          {all.map((w, i) => {
            const active = theme.wallpaper === w.url;
            return (
              <button
                key={w.url}
                type="button"
                className={`st-wall ${active ? "is-active" : ""}`}
                style={{ animationDelay: `${120 + i * 45}ms` }}
                onClick={() => setTheme({ wallpaper: w.url, kind: w.kind })}
                aria-pressed={active}
                title={w.name}
              >
                <span className="st-thumb">
                  {w.kind === "video" ? (
                    <video
                      src={w.url}
                      muted
                      playsInline
                      preload="metadata"
                      onMouseEnter={(e) => void e.currentTarget.play().catch(() => {})}
                      onMouseLeave={(e) => {
                        e.currentTarget.pause();
                        e.currentTarget.currentTime = 0;
                      }}
                    />
                  ) : (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={w.url} alt="" loading="lazy" />
                  )}
                  {w.kind === "video" && (
                    <i className="st-play">
                      <Play className="h-3.5 w-3.5" fill="currentColor" />
                    </i>
                  )}
                  <i className="st-check">
                    <Check className="h-4 w-4" strokeWidth={3} />
                  </i>
                </span>
                <span className="st-name">{w.name}</span>
              </button>
            );
          })}
        </div>

        {loading && items.length === 0 && (
          <p className="st-hint st-loading" role="status">
            <Loader2 className="mr-1.5 inline h-3.5 w-3.5 animate-spin" />
            Loading wallpapers…
          </p>
        )}
        {!loading && items.length === 0 && (
          <p className="st-hint">
            No custom wallpapers yet. Add images (png, jpg, webp, avif, gif) or
            videos (mp4, webm) to <code>public/themes</code> and press Rescan.
          </p>
        )}

        {/* ── My wallpapers (uploaded, stored in MongoDB) ── */}
        <div className="st-sub-head">
          <h3 className="st-sub-title">
            My wallpapers{" "}
            <small>
              ({mine.length}/{mineMax} · only you can see these)
            </small>
          </h3>
        </div>

        <div className="st-wall-grid">
          {mine.map((w, i) => {
            const active = theme.wallpaper === w.url;
            return (
              <div className="st-wall-cell" key={w.id}>
                <button
                  type="button"
                  className={`st-wall ${active ? "is-active" : ""}`}
                  style={{ animationDelay: `${i * 45}ms` }}
                  onClick={() => setTheme({ wallpaper: w.url, kind: "image" })}
                  aria-pressed={active}
                  title={w.name}
                >
                  <span className="st-thumb">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={w.url} alt="" loading="lazy" />
                    <i className="st-check">
                      <Check className="h-4 w-4" strokeWidth={3} />
                    </i>
                  </span>
                  <span className="st-name">{w.name}</span>
                </button>
                <button
                  type="button"
                  className="st-del"
                  onClick={() => void deleteMine(w)}
                  disabled={deletingId === w.id}
                  aria-label={`Delete wallpaper ${w.name}`}
                  title="Delete this wallpaper"
                >
                  {deletingId === w.id ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Trash2 className="h-3.5 w-3.5" />
                  )}
                </button>
              </div>
            );
          })}

          {mine.length < mineMax && (
            <label
              title="PNG, JPG, WebP, AVIF or GIF - up to 8 MB"
              className={`st-upload ${uploading ? "is-busy" : ""} ${dragOver ? "is-drag" : ""}`}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(false);
                void uploadFiles(e.dataTransfer.files);
              }}
            >
              <input
                ref={fileRef}
                type="file"
                accept={ACCEPT}
                multiple
                hidden
                disabled={uploading}
                onChange={(e) => e.target.files && void uploadFiles(e.target.files)}
              />
              <span className="st-thumb">
                <span className="st-upload-in">
                  {uploading ? (
                    <>
                      <Loader2 className="h-6 w-6 animate-spin" />
                      Uploading…
                    </>
                  ) : (
                    <>
                      <ImagePlus className="h-6 w-6" />
                      Add image
                      <small>or drop it here</small>
                    </>
                  )}
                </span>
              </span>
              <span className="st-name">Max 8 MB per image</span>
            </label>
          )}
        </div>

        {mineError && (
          <p className="st-error" role="alert">
            {mineError}
          </p>
        )}
        {!mineLoaded && (
          <p className="st-hint st-loading" role="status">
            <Loader2 className="mr-1.5 inline h-3.5 w-3.5 animate-spin" />
            Loading your wallpapers…
          </p>
        )}
        {mineLoaded && mine.length === 0 && !mineError && (
          <p className="st-hint">
            Upload your own image to use it as the app background. It is saved to your
            account, so it is there on any device you sign in on.
          </p>
        )}
      </section>

      {/* ── Glass ── */}
      <section
        className="dg-card st-card dg-in"
        style={{ "--d": "180ms" } as React.CSSProperties}
      >
        <div className="dg-card-head">
          <span className="dg-card-icon">
            <Palette className="h-[18px] w-[18px]" strokeWidth={2} />
          </span>
          <h2 className="dg-card-title">Glass theme</h2>
        </div>

        <div className="st-presets">
          {GLASS_PRESETS.map((p) => (
            <button
              key={p.id}
              type="button"
              className={`st-preset ${activePreset === p.id ? "is-active" : ""}`}
              onClick={() => setTheme({ blur: p.blur, fill: p.fill, dim: p.dim })}
            >
              {p.label}
            </button>
          ))}
          {!activePreset && <span className="st-preset is-custom">Custom</span>}
        </div>

        <div className="st-sliders">
          <Slider
            label="Panel blur"
            value={theme.blur}
            min={0}
            max={30}
            step={1}
            unit="px"
            display={theme.blur}
            onChange={(v) => setTheme({ blur: v })}
          />
          <Slider
            label="Panel opacity"
            value={theme.fill}
            min={0}
            max={0.4}
            step={0.01}
            unit="%"
            display={Math.round(theme.fill * 100)}
            onChange={(v) => setTheme({ fill: v })}
          />
          <Slider
            label="Wallpaper dimming"
            value={theme.dim}
            min={0}
            max={0.7}
            step={0.01}
            unit="%"
            display={Math.round(theme.dim * 100)}
            onChange={(v) => setTheme({ dim: v })}
          />
        </div>
        <div className="st-accent">
          <div className="st-slider-top">
            <span>Icon colour</span>
            <b>
              {theme.accent
                ? (ACCENT_PRESETS.find((a) => a.value === theme.accent)?.label ??
                  theme.accent.toUpperCase())
                : "Multicolour"}
            </b>
          </div>
          <div className="st-swatches">
            <button
              type="button"
              className={`st-swatch is-multi ${!theme.accent ? "is-active" : ""}`}
              title="Multicolour"
              aria-label="Multicolour"
              aria-pressed={!theme.accent}
              onClick={() => setTheme({ accent: "" })}
            />
            {ACCENT_PRESETS.map((a) => (
              <button
                key={a.value}
                type="button"
                className={`st-swatch ${theme.accent === a.value ? "is-active" : ""}`}
                style={{ background: a.value }}
                title={a.label}
                aria-label={a.label}
                aria-pressed={theme.accent === a.value}
                onClick={() => setTheme({ accent: a.value })}
              />
            ))}
            <label className="st-swatch is-picker" title="Custom colour">
              <input
                type="color"
                value={theme.accent || "#4f7df5"}
                onChange={(e) => setTheme({ accent: e.target.value })}
                aria-label="Custom icon colour"
              />
            </label>
          </div>
        </div>
        <p className="st-hint">
          <SlidersHorizontal className="mr-1.5 inline h-3.5 w-3.5" />
          Changes apply instantly across the whole CRM.
        </p>
      </section>

      {/* ── Text & fonts ── */}
      <section
        className="dg-card st-card dg-in"
        style={{ "--d": "240ms" } as React.CSSProperties}
      >
        <div className="dg-card-head">
          <span className="dg-card-icon">
            <Type className="h-[18px] w-[18px]" strokeWidth={2} />
          </span>
          <h2 className="dg-card-title">Text &amp; fonts</h2>
          <button
            type="button"
            className="st-ghost ml-auto"
            onClick={() => setTheme(DEFAULT_TYPOGRAPHY)}
          >
            <RotateCcw className="h-4 w-4" strokeWidth={2} /> Reset text
          </button>
        </div>

        <div className="st-type-grid">
          <div className="st-type-col">
            <div className="st-type-title">Headings</div>
            <FontSelect
              label="Font"
              value={theme.headFont}
              onChange={(id) => setTheme({ headFont: id })}
            />
            <Slider
              label="Size"
              value={theme.headScale}
              min={HEAD_SCALE_RANGE.min}
              max={HEAD_SCALE_RANGE.max}
              step={HEAD_SCALE_RANGE.step}
              unit="%"
              display={Math.round(theme.headScale * 100)}
              onChange={(v) => setTheme({ headScale: v })}
            />
            <WeightChips
              label="Weight"
              value={theme.headWeight}
              options={HEADING_WEIGHTS}
              onChange={(v) => setTheme({ headWeight: v })}
            />
            <TextColorPicker
              label="Colour"
              value={theme.headColor}
              onChange={(hex) => setTheme({ headColor: hex })}
            />
          </div>

          <div className="st-type-col">
            <div className="st-type-title">Body text</div>
            <FontSelect
              label="Font"
              value={theme.bodyFont}
              onChange={(id) => setTheme({ bodyFont: id })}
            />
            <Slider
              label="Size"
              value={theme.textScale}
              min={TEXT_SCALE_RANGE.min}
              max={TEXT_SCALE_RANGE.max}
              step={TEXT_SCALE_RANGE.step}
              unit="%"
              display={Math.round(theme.textScale * 100)}
              onChange={(v) => setTheme({ textScale: v })}
            />
            <WeightChips
              label="Weight"
              value={theme.bodyWeight}
              options={BODY_WEIGHTS}
              onChange={(v) => setTheme({ bodyWeight: v })}
            />
            <TextColorPicker
              label="Colour"
              value={theme.bodyColor}
              onChange={(hex) => setTheme({ bodyColor: hex })}
            />
          </div>
        </div>

        <div className="st-preview" aria-label="Preview">
          <p className="st-preview-head">Collections overview</p>
          <p className="st-preview-body">
            The quick brown fox jumps over the lazy dog. Payments of $1,250.00 are due
            on 14 Mar 2026 - 0123456789.
          </p>
        </div>
        <p className="st-hint">
          <Type className="mr-1.5 inline h-3.5 w-3.5" />
          Saved in this browser. Body weight only changes text that is not already bold.
        </p>
      </section>
    </div>
  );
}
