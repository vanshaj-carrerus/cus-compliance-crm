"use client";

import { useEffect, useSyncExternalStore } from "react";
import {
  DEFAULT_THEME,
  getServerTheme,
  getTheme,
  setTheme,
  subscribeTheme,
} from "@/lib/theme-store";

/**
 * If the selected wallpaper is one of the user's uploads that no longer exists
 * (deleted on another device, or chosen by a different account on this
 * browser), fall back to the default instead of leaving a blank background.
 */
export function WallpaperGuard() {
  const wallpaper = useSyncExternalStore(
    subscribeTheme,
    () => getTheme().wallpaper,
    () => getServerTheme().wallpaper
  );

  useEffect(() => {
    if (!wallpaper.startsWith("/api/wallpapers/")) return;
    let cancelled = false;
    fetch(wallpaper)
      .then((res) => {
        if (!cancelled && res.status === 404) {
          setTheme({ wallpaper: DEFAULT_THEME.wallpaper, kind: DEFAULT_THEME.kind });
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [wallpaper]);

  return null;
}
