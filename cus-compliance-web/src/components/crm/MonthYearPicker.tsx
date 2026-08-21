"use client";

import { useEffect, useRef, useState } from "react";
import { MONTHS } from "@/lib/crm/types";

function parseValue(value: string): { month: number; year: number } | null {
  const m = String(value || "")
    .trim()
    .match(/^([A-Za-z]+)\s+(\d{4})$/);
  if (!m) return null;
  const idx = MONTHS.findIndex(
    (name) => name.toLowerCase() === m[1].toLowerCase()
  );
  if (idx === -1) return null;
  return { month: idx, year: Number(m[2]) };
}

export function MonthYearPicker({
  value,
  onChange,
  className = "",
}: {
  value: string;
  onChange: (value: string) => void;
  className?: string;
}) {
  const parsed = parseValue(value);
  const [open, setOpen] = useState(false);
  const [viewYear, setViewYear] = useState(
    parsed?.year ?? new Date().getFullYear()
  );
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const pick = (monthIdx: number) => {
    onChange(`${MONTHS[monthIdx]} ${viewYear}`);
    setOpen(false);
  };

  return (
    <div className={`relative ${className}`} ref={rootRef}>
      <button
        type="button"
        className={
          "flex w-full items-center justify-between gap-2 rounded-[var(--radius)] border border-border bg-input px-3.5 py-2.5 text-left text-sm outline-none transition-colors focus:border-primary" +
          (open ? " border-primary" : "")
        }
        onClick={() =>
          setOpen((o) => {
            if (!o) setViewYear(parsed?.year ?? new Date().getFullYear());
            return !o;
          })
        }
      >
        <span className={value ? "" : "text-muted"}>
          {value || "Select month & year"}
        </span>
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          className="shrink-0 text-muted"
        >
          <rect
            x="3"
            y="5"
            width="18"
            height="16"
            rx="2"
            stroke="currentColor"
            strokeWidth="2"
          />
          <path d="M3 10h18M8 3v4M16 3v4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      </button>

      {open && (
        <div className="absolute left-0 top-[calc(100%+6px)] z-50 w-64 rounded-[var(--radius)] border border-border bg-card p-3 shadow-xl">
          <div className="mb-2 flex items-center justify-between">
            <button
              type="button"
              className="flex h-7 w-7 items-center justify-center rounded-md text-muted transition-colors hover:bg-secondary hover:text-foreground"
              onClick={() => setViewYear((y) => y - 1)}
              aria-label="Previous year"
            >
              ‹
            </button>
            <span className="text-sm font-semibold">{viewYear}</span>
            <button
              type="button"
              className="flex h-7 w-7 items-center justify-center rounded-md text-muted transition-colors hover:bg-secondary hover:text-foreground"
              onClick={() => setViewYear((y) => y + 1)}
              aria-label="Next year"
            >
              ›
            </button>
          </div>
          <div className="grid grid-cols-3 gap-1.5">
            {MONTHS.map((name, idx) => {
              const selected =
                parsed && parsed.month === idx && parsed.year === viewYear;
              return (
                <button
                  key={name}
                  type="button"
                  className={
                    "rounded-md px-2 py-1.5 text-xs font-medium transition-colors " +
                    (selected
                      ? "bg-primary text-primary-foreground"
                      : "text-foreground hover:bg-secondary")
                  }
                  onClick={() => pick(idx)}
                >
                  {name.slice(0, 3)}
                </button>
              );
            })}
          </div>
          {value && (
            <button
              type="button"
              className="mt-2 w-full rounded-md px-2 py-1 text-xs text-muted transition-colors hover:bg-secondary hover:text-foreground"
              onClick={() => {
                onChange("");
                setOpen(false);
              }}
            >
              Clear
            </button>
          )}
        </div>
      )}
    </div>
  );
}
