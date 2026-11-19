"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { Check, ImageIcon, Palette, Play, RefreshCw, RotateCcw, SlidersHorizontal } from "lucide-react";
import {
  ACCENT_PRESETS,
  GLASS_PRESETS,
  getServerTheme,
  getTheme,
  resetTheme,
  setTheme,
  subscribeTheme,
  type WallpaperKind,
} from "@/lib/theme-store";

interface WallpaperItem {
  name: string;
  url: string;
  kind: WallpaperKind;
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
            Personalise your workspace. Saved in this browser only.
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

        {!loading && items.length === 0 && (
          <p className="st-hint">
            No custom wallpapers yet. Add images (png, jpg, webp, avif, gif) or
            videos (mp4, webm) to <code>public/themes</code> and press Rescan.
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
    </div>
  );
}
