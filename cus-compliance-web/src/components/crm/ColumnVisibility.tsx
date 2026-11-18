"use client";

import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";

// Presentation-only "manage columns" layer for every table in the CRM.
//
// - <TableColumnManager/> (mounted once in the shell) watches the page's
//   tables, adds a hover "−" button to each column header, and collapses the
//   chosen column by toggling a `data-col-hidden` attribute on that column's
//   header + cells. Nothing in any page's React state, data or logic is
//   touched - the cells stay in the DOM, they are just visually collapsed
//   (see "Column hide/show" in globals.css for the animation).
// - <ColumnsMenu/> is the small button placed in each page's toolbar; it lists
//   the hidden columns of the tables next to it and brings them back.
// - Which columns are hidden is a per-browser preference in localStorage.

const STORAGE_KEY = "crmHiddenColumns";
const TABLE_SELECTOR = ".crm-view-transition table";

// ── store ────────────────────────────────────────────────────────────────
type HiddenMap = Record<string, string[]>; // scopeId -> hidden column keys

let hidden: HiddenMap = {};
let loaded = false;
const listeners = new Set<() => void>();

function load() {
  if (loaded || typeof window === "undefined") return;
  loaded = true;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    if (parsed && typeof parsed === "object") hidden = parsed as HiddenMap;
  } catch {
    // blocked/malformed storage - start with everything visible
  }
}

function commit(next: HiddenMap) {
  hidden = next;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // ignore blocked storage
  }
  listeners.forEach((l) => l());
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}
function getSnapshot() {
  load();
  return hidden;
}
const serverSnapshot: HiddenMap = {};

function hideColumn(scope: string, key: string) {
  const cur = hidden[scope] || [];
  if (cur.includes(key)) return;
  commit({ ...hidden, [scope]: [...cur, key] });
}
function showColumn(scope: string, key: string) {
  const cur = hidden[scope] || [];
  const next = cur.filter((k) => k !== key);
  const copy = { ...hidden };
  if (next.length) copy[scope] = next;
  else delete copy[scope];
  commit(copy);
}
function showAll(scopes: string[]) {
  const copy = { ...hidden };
  scopes.forEach((s) => delete copy[s]);
  commit(copy);
}

const labelOf = (key: string) => key.replace(/#\d+$/, "");

// ── DOM layer ────────────────────────────────────────────────────────────
const MINUS_SVG =
  '<svg viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" aria-hidden="true"><path d="M5 12h14"/></svg>';

function headerLabel(th: HTMLTableCellElement): string {
  return (th.textContent || "").replace(/[⠿]/g, "").replace(/\s+/g, " ").trim();
}

function syncTable(table: HTMLTableElement, scope: string, hiddenKeys: string[]) {
  const headRow = table.tHead?.rows[0];
  if (!headRow) return;
  const ths = Array.from(headRow.cells);
  if (!ths.length || ths.some((th) => th.colSpan > 1)) return;

  table.dataset.colScope = scope;

  const seen = new Map<string, number>();
  const keys = ths.map((th) => {
    const label = headerLabel(th);
    if (!label || !/[a-z0-9]/i.test(label)) return "";
    if (th.classList.contains("row-head") || th.classList.contains("freeze-check")) return "";
    const n = (seen.get(label) || 0) + 1;
    seen.set(label, n);
    return n > 1 ? `${label}#${n}` : label;
  });

  const bodyRows: HTMLTableRowElement[] = [];
  Array.from(table.tBodies).forEach((tb) => bodyRows.push(...Array.from(tb.rows)));

  ths.forEach((th, i) => {
    const key = keys[i];
    if (!key) return;
    th.dataset.colKey = key;

    if (!th.querySelector(":scope > .col-hide-btn")) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "col-hide-btn";
      btn.title = "Hide this column";
      btn.setAttribute("aria-label", `Hide ${labelOf(key)} column`);
      btn.innerHTML = MINUS_SVG;
      // Keep header interactions (column select, drag-reorder, sort) from
      // firing when the button is used.
      for (const ev of ["mousedown", "pointerdown", "dragstart"]) {
        btn.addEventListener(ev, (e) => e.stopPropagation());
      }
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        e.preventDefault();
        const t = btn.closest("table");
        const k = btn.parentElement?.getAttribute("data-col-key");
        const s = t?.dataset.colScope;
        if (k && s) hideColumn(s, k);
      });
      if (getComputedStyle(th).position === "static") th.style.position = "relative";
      th.appendChild(btn);
    }

    const isHidden = hiddenKeys.includes(key);
    const cells: HTMLElement[] = [th];
    bodyRows.forEach((r) => {
      if (r.cells.length === ths.length) cells.push(r.cells[i]);
    });
    cells.forEach((el) => {
      if (isHidden) {
        if (!el.hasAttribute("data-col-hidden")) {
          el.setAttribute("data-col-hidden", "");
        }
      } else if (el.hasAttribute("data-col-hidden")) {
        el.removeAttribute("data-col-hidden");
      }
    });
  });
}

export function TableColumnManager({ view }: { view: string }) {
  useLayoutEffect(() => {
    if (view === "admin") return; // admin tables are action tables, not sheets
    const main = document.querySelector("main");
    if (!main) return;

    const run = () => {
      const map = getSnapshot();
      Array.from(main.querySelectorAll<HTMLTableElement>(TABLE_SELECTOR)).forEach(
        (table, idx) => {
          const scope = `${view}:${idx}`;
          const wasReady = table.hasAttribute("data-col-ready");
          syncTable(table, scope, map[scope] || []);
          // Transitions only switch on after the first pass, so a page load
          // (or a freshly rendered table) never animates its saved state in.
          if (!wasReady) {
            requestAnimationFrame(() => table.setAttribute("data-col-ready", ""));
          }
        }
      );
    };

    run();
    const mo = new MutationObserver(run);
    mo.observe(main, { childList: true, subtree: true });
    const unsub = subscribe(run);
    return () => {
      mo.disconnect();
      unsub();
    };
  }, [view]);

  return null;
}

// Which data-column indices (the `data-col` each sheet cell carries) are
// currently hidden inside `root`. Sheet copy / paste / clear / arrow-key code
// uses this so a hidden column is skipped exactly as if it weren't there.
export function hiddenDataCols(root: ParentNode | null | undefined): Set<number> {
  const out = new Set<number>();
  root?.querySelectorAll<HTMLElement>("td[data-col][data-col-hidden]").forEach((td) => {
    const n = Number(td.dataset.col);
    if (!Number.isNaN(n)) out.add(n);
  });
  return out;
}

// ── toolbar button ───────────────────────────────────────────────────────
// Finds the tables belonging to the region this button sits in: walk up until
// an ancestor contains a managed table.
function regionScopes(el: HTMLElement | null): string[] {
  let node = el?.parentElement || null;
  while (node && !node.querySelector("table[data-col-scope]")) node = node.parentElement;
  if (!node) return [];
  return Array.from(node.querySelectorAll<HTMLElement>("table[data-col-scope]")).map(
    (t) => t.dataset.colScope as string
  );
}

export function ColumnsMenu() {
  const map = useSyncExternalStore(subscribe, getSnapshot, () => serverSnapshot);
  const wrapRef = useRef<HTMLSpanElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const [scopes, setScopes] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  const [closing, setClosing] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  // Re-resolve the region's tables after mount and whenever hidden state
  // changes (the manager tags tables right after they render).
  useEffect(() => {
    const id = requestAnimationFrame(() => {
      const next = regionScopes(wrapRef.current);
      setScopes((prev) =>
        prev.length === next.length && prev.every((s, i) => s === next[i]) ? prev : next
      );
    });
    return () => cancelAnimationFrame(id);
  }, [map, open]);

  const items = scopes.flatMap((s) => (map[s] || []).map((k) => ({ scope: s, key: k })));
  const count = items.length;

  const close = () => {
    setClosing(true);
    window.setTimeout(() => {
      setOpen(false);
      setClosing(false);
    }, 140);
  };

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (wrapRef.current?.contains(t)) return;
      if ((t as HTMLElement).closest?.("[data-col-popover]")) return;
      close();
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const toggle = () => {
    if (open) return close();
    const r = btnRef.current?.getBoundingClientRect();
    if (r) setPos({ top: r.bottom + 8, left: Math.max(8, Math.min(r.left, window.innerWidth - 280)) });
    setOpen(true);
  };

  return (
    <span ref={wrapRef} className="col-menu-wrap">
      <button
        ref={btnRef}
        type="button"
        className="col-menu-btn"
        onClick={toggle}
        title="Manage columns - bring hidden columns back"
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="3" y="4" width="18" height="16" rx="2.5" />
          <path d="M9 4v16M15 4v16" />
        </svg>
        Columns
        {count > 0 && <span className="col-menu-badge">{count}</span>}
      </button>
      {open && pos && (
        <div
          data-col-popover
          className={`col-popover ${closing ? "col-popover-out" : ""}`}
          style={{ top: pos.top, left: pos.left }}
          role="dialog"
          aria-label="Hidden columns"
        >
          <div className="col-popover-head">
            <span>Hidden columns</span>
            {count > 1 && (
              <button type="button" className="col-popover-all" onClick={() => showAll(scopes)}>
                Show all
              </button>
            )}
          </div>
          {count === 0 ? (
            <div className="col-popover-empty">
              Every column is visible. Hover a column header and click the
              <span className="col-popover-minus">−</span>
              button to hide it.
            </div>
          ) : (
            <div className="col-popover-list">
              {items.map(({ scope, key }, i) => (
                <button
                  key={scope + key}
                  type="button"
                  className="col-chip"
                  style={{ animationDelay: `${i * 30}ms` }}
                  onClick={() => showColumn(scope, key)}
                  title="Show this column again"
                >
                  <span className="col-chip-plus">+</span>
                  {labelOf(key)}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </span>
  );
}
