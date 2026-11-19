"use client";

import { useEffect } from "react";

/**
 * Purely decorative: tracks the pointer over glass cards and publishes its
 * position as --mx / --my so CSS can paint a soft cursor-follow highlight
 * (see aurora.css). Renders nothing and never touches app state or data.
 */
const GLASS_SELECTOR =
  '[class*="bg-card"]:not(.data-table-container):not(.master-theme-card),.stat-card,.chart-card,.workflow-rule-card,.backup-panel';

export default function GlassFX() {
  useEffect(() => {
    if (!window.matchMedia("(hover: hover)").matches) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let raf = 0;
    let lastX = 0;
    let lastY = 0;
    let lastTarget: EventTarget | null = null;

    const apply = () => {
      raf = 0;
      if (!(lastTarget instanceof Element)) return;
      const el = lastTarget.closest<HTMLElement>(GLASS_SELECTOR);
      if (!el) return;
      const r = el.getBoundingClientRect();
      el.style.setProperty("--mx", `${lastX - r.left}px`);
      el.style.setProperty("--my", `${lastY - r.top}px`);
    };

    const onMove = (e: PointerEvent) => {
      lastX = e.clientX;
      lastY = e.clientY;
      lastTarget = e.target;
      if (!raf) raf = requestAnimationFrame(apply);
    };

    document.addEventListener("pointermove", onMove, { passive: true });
    return () => {
      document.removeEventListener("pointermove", onMove);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  return null;
}
