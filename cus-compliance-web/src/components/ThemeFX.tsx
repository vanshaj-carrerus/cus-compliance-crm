"use client";

import { useEffect, useSyncExternalStore } from "react";
import {
  GRADIENTS,
  getServerTheme,
  getTheme,
  subscribeTheme,
} from "@/lib/theme-store";

const FALLBACK_ACCENT = "#4f7df5";

/**
 * Applies the browser-stored appearance: paints the wallpaper (image, gradient
 * or looping video) behind the app and publishes glass strength + accent as CSS
 * variables so every surface (sidebar, top bar, cards) follows the same theme.
 * The "Liquid Glass" wallpaper also switches on the light design system
 * (html[data-ui="liquid"], see liquid.css) and a few slow atmospheric bubbles.
 * Presentation only.
 */
export default function ThemeFX() {
  const t = useSyncExternalStore(subscribeTheme, getTheme, getServerTheme);
  const liquid = t.wallpaper === "gradient:liquid";

  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty("--ui-blur", `${t.blur}px`);
    root.style.setProperty("--ui-fill", String(t.fill));
    root.style.setProperty("--ui-dim", String(t.dim));
    // accent always exists (sidebar highlight, buttons); icons only recolour
    // when a single colour was chosen (data-accent).
    root.style.setProperty("--ui-accent", t.accent || FALLBACK_ACCENT);
    if (t.accent) root.setAttribute("data-accent", "custom");
    else root.removeAttribute("data-accent");
  }, [t.blur, t.fill, t.dim, t.accent]);

  useEffect(() => {
    const root = document.documentElement;
    if (liquid) root.setAttribute("data-ui", "liquid");
    else root.removeAttribute("data-ui");
    return () => root.removeAttribute("data-ui");
  }, [liquid]);

  // Pause decorative motion while anything is scrolling (CSS keys off
  // html[data-scrolling]); scroll events don't bubble, so listen in capture.
  useEffect(() => {
    if (!liquid) return;
    const root = document.documentElement;
    let timer = 0;
    const onScroll = () => {
      if (!root.hasAttribute("data-scrolling")) root.setAttribute("data-scrolling", "");
      window.clearTimeout(timer);
      timer = window.setTimeout(() => root.removeAttribute("data-scrolling"), 160);
    };
    document.addEventListener("scroll", onScroll, { capture: true, passive: true });
    return () => {
      document.removeEventListener("scroll", onScroll, { capture: true });
      window.clearTimeout(timer);
      root.removeAttribute("data-scrolling");
    };
  }, [liquid]);

  const gradient =
    t.kind === "gradient" ? GRADIENTS[t.wallpaper.slice(9)]?.css : undefined;

  // Page canvas + fullscreen sheets (.fixed.bg-background) paint var(--aurora),
  // so point it at the chosen wallpaper (video falls back to a flat colour).
  useEffect(() => {
    document.documentElement.style.setProperty(
      "--aurora",
      t.kind === "video"
        ? "linear-gradient(#1d4f9c, #1d4f9c)"
        : (gradient ?? `url("${t.wallpaper}")`),
    );
  }, [t.kind, t.wallpaper, gradient]);

  return (
    <>
      <div className="wallpaper-layer" aria-hidden>
        {t.kind === "video" ? (
          <video
            key={t.wallpaper}
            className="wallpaper-media"
            src={t.wallpaper}
            autoPlay
            muted
            loop
            playsInline
            preload="auto"
          />
        ) : (
          <div
            key={t.wallpaper}
            className="wallpaper-media"
            style={{
              backgroundImage:
                gradient ?? `url("${t.wallpaper}")`,
            }}
          />
        )}
        {liquid && (
          <>
            <span className="lg-bubble lg-bubble-1" />
            <span className="lg-bubble lg-bubble-2" />
            <span className="lg-bubble lg-bubble-3" />
            <span className="lg-bubble lg-bubble-4" />
            <span className="lg-bubble lg-bubble-5" />
          </>
        )}
      </div>
      <div className="wallpaper-dim" aria-hidden />
    </>
  );
}
