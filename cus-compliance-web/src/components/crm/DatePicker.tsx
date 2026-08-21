"use client";

import { useEffect, useRef, useState } from "react";
import { fmtDate, todayIso } from "@/lib/crm/dates";

const WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

function parseIso(v: string): { y: number; m: number; d: number } | null {
  const match = String(v || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  return { y: Number(match[1]), m: Number(match[2]) - 1, d: Number(match[3]) };
}

function toIso(y: number, m: number, d: number): string {
  return `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

export function DatePicker({
  value,
  onChange,
  className = "",
}: {
  value: string;
  onChange: (value: string) => void;
  className?: string;
}) {
  const parsed = parseIso(value);
  const [open, setOpen] = useState(false);
  const [viewY, setViewY] = useState(parsed?.y ?? new Date().getFullYear());
  const [viewM, setViewM] = useState(parsed?.m ?? new Date().getMonth());
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

  const openPicker = () => {
    setViewY(parsed?.y ?? new Date().getFullYear());
    setViewM(parsed?.m ?? new Date().getMonth());
    setOpen(true);
  };

  const shiftMonth = (delta: number) => {
    let m = viewM + delta;
    let y = viewY;
    if (m < 0) {
      m = 11;
      y -= 1;
    } else if (m > 11) {
      m = 0;
      y += 1;
    }
    setViewM(m);
    setViewY(y);
  };

  const pick = (day: number) => {
    onChange(toIso(viewY, viewM, day));
    setOpen(false);
  };

  const firstWeekday = new Date(viewY, viewM, 1).getDay();
  const daysInMonth = new Date(viewY, viewM + 1, 0).getDate();
  const today = parseIso(todayIso())!;

  const cells: (number | null)[] = [
    ...Array(firstWeekday).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];

  return (
    <div className={`relative ${className}`} ref={rootRef}>
      <button
        type="button"
        className={
          "flex w-full items-center justify-between gap-2 rounded-[var(--radius)] border border-border bg-input px-3.5 py-2.5 text-left text-sm outline-none transition-colors focus:border-primary" +
          (open ? " border-primary" : "")
        }
        onClick={() => (open ? setOpen(false) : openPicker())}
      >
        <span className={value ? "" : "text-muted"}>
          {value ? fmtDate(value) : "Select date"}
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
          <path
            d="M3 10h18M8 3v4M16 3v4"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
      </button>

      {open && (
        <div className="absolute left-0 top-[calc(100%+6px)] z-50 w-72 rounded-[var(--radius)] border border-border bg-card p-3 shadow-xl">
          <div className="mb-2 flex items-center justify-between">
            <button
              type="button"
              className="flex h-7 w-7 items-center justify-center rounded-md text-muted transition-colors hover:bg-secondary hover:text-foreground"
              onClick={() => shiftMonth(-1)}
              aria-label="Previous month"
            >
              ‹
            </button>
            <span className="text-sm font-semibold">
              {MONTH_NAMES[viewM]} {viewY}
            </span>
            <button
              type="button"
              className="flex h-7 w-7 items-center justify-center rounded-md text-muted transition-colors hover:bg-secondary hover:text-foreground"
              onClick={() => shiftMonth(1)}
              aria-label="Next month"
            >
              ›
            </button>
          </div>

          <div className="mb-1 grid grid-cols-7 gap-1">
            {WEEKDAYS.map((w) => (
              <div
                key={w}
                className="flex h-6 items-center justify-center text-[10px] font-medium text-muted"
              >
                {w}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-1">
            {cells.map((day, i) => {
              if (day === null) return <div key={i} />;
              const selected =
                !!parsed &&
                parsed.y === viewY &&
                parsed.m === viewM &&
                parsed.d === day;
              const isToday =
                today.y === viewY && today.m === viewM && today.d === day;
              return (
                <button
                  key={i}
                  type="button"
                  className={
                    "flex h-8 w-8 items-center justify-center rounded-md text-xs font-medium transition-colors " +
                    (selected
                      ? "bg-primary text-primary-foreground"
                      : isToday
                      ? "border border-primary text-primary"
                      : "text-foreground hover:bg-secondary")
                  }
                  onClick={() => pick(day)}
                >
                  {day}
                </button>
              );
            })}
          </div>

          <div className="mt-2 flex items-center justify-between gap-2 border-t border-border pt-2">
            <button
              type="button"
              className="rounded-md px-2 py-1 text-xs text-muted transition-colors hover:bg-secondary hover:text-foreground"
              onClick={() => {
                onChange(todayIso());
                setOpen(false);
              }}
            >
              Today
            </button>
            {value && (
              <button
                type="button"
                className="rounded-md px-2 py-1 text-xs text-muted transition-colors hover:bg-secondary hover:text-foreground"
                onClick={() => {
                  onChange("");
                  setOpen(false);
                }}
              >
                Clear
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
