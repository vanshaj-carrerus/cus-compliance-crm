"use client";

import { useEffect, useState } from "react";

type InstallEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

const DISMISS_KEY = "cus-install-dismissed";

function isStandalone() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function isIos() {
  const ua = navigator.userAgent;
  // iPadOS 13+ reports as Mac with touch support.
  return /iPad|iPhone|iPod/.test(ua) || (ua.includes("Mac") && navigator.maxTouchPoints > 1);
}

function wasDismissed() {
  try {
    return localStorage.getItem(DISMISS_KEY) === "1";
  } catch {
    return false;
  }
}

export default function PwaProvider() {
  const [deferred, setDeferred] = useState<InstallEvent | null>(null);
  const [showIos, setShowIos] = useState(false);

  useEffect(() => {
    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") {
      navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {});
    }

    if (isStandalone() || wasDismissed()) return;

    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferred(e as InstallEvent);
    };
    const onInstalled = () => {
      setDeferred(null);
      setShowIos(false);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);

    // iOS has no install event; show manual instructions (only Safari can install).
    const ua = navigator.userAgent;
    const safari = /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS/.test(ua);
    let t: number | undefined;
    if (isIos() && safari) t = window.setTimeout(() => setShowIos(true), 2500);

    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
      if (t) window.clearTimeout(t);
    };
  }, []);

  const dismiss = () => {
    setDeferred(null);
    setShowIos(false);
    try {
      localStorage.setItem(DISMISS_KEY, "1");
    } catch {}
  };

  const install = async () => {
    if (!deferred) return;
    await deferred.prompt();
    await deferred.userChoice;
    setDeferred(null);
  };

  if (!deferred && !showIos) return null;

  return (
    <div
      role="dialog"
      aria-label="Install app"
      className="fixed inset-x-3 z-[100] mx-auto max-w-md rounded-2xl border border-border bg-card p-4 shadow-lg"
      style={{ bottom: "calc(env(safe-area-inset-bottom) + 12px)" }}
    >
      <div className="flex items-start gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/icons/icon-192.png" alt="" className="h-11 w-11 rounded-xl border border-border" />
        <div className="min-w-0 flex-1 text-sm text-card-foreground">
          <p className="font-semibold">Install CUS CRM</p>
          {deferred ? (
            <p className="text-muted">Add it to your home screen for a full-screen, app-like experience.</p>
          ) : (
            <p className="text-muted">
              Tap the <b>Share</b> button in Safari, then choose <b>Add to Home Screen</b>.
            </p>
          )}
        </div>
      </div>
      <div className="mt-3 flex justify-end gap-2">
        <button onClick={dismiss} className="rounded-lg px-3 py-2 text-sm text-muted">
          Not now
        </button>
        {deferred && (
          <button
            onClick={install}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
          >
            Install
          </button>
        )}
      </div>
    </div>
  );
}
