"use client";

import { useDeferredValue, useEffect, useId, useMemo, useRef, useState } from "react";
import { Search } from "lucide-react";
import { useCrm } from "./CrmProvider";
import { requestCandidateFocus } from "@/lib/search-focus";
import type { Candidate } from "@/lib/crm/types";

const MAX_RESULTS = 8;

const digits = (s: string) => s.replace(/\D/g, "");

interface Hit {
  c: Candidate;
  rank: number;
}

/** Name hits first (prefix > word start > anywhere), then every other field. */
function searchCandidates(list: Candidate[], raw: string): { hits: Hit[]; total: number } {
  const q = raw.toLowerCase().trim();
  if (!q) return { hits: [], total: 0 };
  const tokens = q.split(/\s+/).filter(Boolean);
  const qDigits = digits(q);
  const useDigits = qDigits.length >= 3 && qDigits.length === q.replace(/[\s()+-]/g, "").length;
  const hits: Hit[] = [];
  for (const c of list) {
    const name = String(c.name || "").toLowerCase();
    const hay = [
      name,
      c.po,
      c.floor,
      c.status,
      c.assignedTo,
      c.remarks,
      c.poMonth,
      c.phoneNumber,
    ]
      .map((x) => String(x || "").toLowerCase())
      .join(" ");
    const textMatch = tokens.every((t) => hay.includes(t));
    const phoneMatch = useDigits && digits(String(c.phoneNumber || "")).includes(qDigits);
    if (!textMatch && !phoneMatch) continue;
    let rank = 3;
    if (name.startsWith(q)) rank = 0;
    else if (name.split(/\s+/).some((w) => w.startsWith(q))) rank = 1;
    else if (tokens.every((t) => name.includes(t))) rank = 2;
    hits.push({ c, rank });
  }
  hits.sort((a, b) => a.rank - b.rank);
  return { hits: hits.slice(0, MAX_RESULTS), total: hits.length };
}

function Marked({ text, query }: { text: string; query: string }) {
  const q = query.trim().toLowerCase();
  const i = q ? text.toLowerCase().indexOf(q) : -1;
  if (i < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, i)}
      <mark>{text.slice(i, i + q.length)}</mark>
      {text.slice(i + q.length)}
    </>
  );
}

/**
 * Header search: keeps the existing live filter (searchQuery) and adds a
 * result list under the box that works on every page. Picking a result opens
 * the Master P.O Sheet and highlights that candidate.
 */
export function HeaderSearch() {
  const {
    candidates,
    ready,
    searchQuery,
    setSearchQuery,
    setActiveFilters,
    setSmartFilter,
    navigate,
  } = useCrm();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const boxRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();

  const deferred = useDeferredValue(searchQuery);
  const { hits, total } = useMemo(
    () => (ready ? searchCandidates(candidates, deferred) : { hits: [], total: 0 }),
    [ready, candidates, deferred]
  );
  const show = open && searchQuery.trim().length > 0;
  const activeIdx = Math.min(active, Math.max(0, hits.length - 1));

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open]);

  const pick = (c: Candidate) => {
    // Show the whole sheet so the candidate is always in it, then jump there.
    setSearchQuery("");
    setActiveFilters({});
    setSmartFilter(null);
    setOpen(false);
    inputRef.current?.blur();
    navigate("master");
    requestCandidateFocus(c.id);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") {
      if (open) {
        e.preventDefault();
        setOpen(false);
      }
      return;
    }
    if (!show || !hits.length) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((activeIdx + 1) % hits.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((activeIdx - 1 + hits.length) % hits.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      pick(hits[activeIdx].c);
    }
  };

  return (
    <div ref={boxRef} className="crm-search relative min-w-0 flex-1">
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted">
        <Search className="h-4 w-4" />
      </span>
      <input
        ref={inputRef}
        type="search"
        value={searchQuery}
        onChange={(e) => {
          setSearchQuery(e.target.value);
          setActive(0);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        placeholder="Search candidates, PO, floor, status..."
        className="h-9 w-full rounded-(--radius) border border-border bg-input py-1.5 pl-10 pr-3 text-sm text-foreground outline-none focus:border-primary sm:h-auto"
        aria-label="Search candidates"
        role="combobox"
        aria-expanded={show}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={show && hits.length ? `${listId}-${activeIdx}` : undefined}
        autoComplete="off"
      />

      {show && (
        <div className="hs-panel" id={listId} role="listbox" aria-label="Search results">
          {hits.length === 0 ? (
            <div className="hs-empty">
              {ready ? (
                <>No candidates match &ldquo;{searchQuery.trim()}&rdquo;</>
              ) : (
                <>Still loading candidates…</>
              )}
            </div>
          ) : (
            <>
              <div className="hs-head">
                {total} {total === 1 ? "match" : "matches"}
                {total > hits.length ? ` · showing top ${hits.length}` : ""}
              </div>
              {hits.map(({ c }, i) => {
                const meta = [c.poMonth, c.assignedTo, c.phoneNumber].filter(Boolean).join(" · ");
                return (
                  <button
                    key={c.id}
                    id={`${listId}-${i}`}
                    type="button"
                    role="option"
                    aria-selected={i === activeIdx}
                    className={`hs-item ${i === activeIdx ? "is-active" : ""}`}
                    onMouseEnter={() => setActive(i)}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => pick(c)}
                  >
                    <span className="hs-main">
                      <span className="hs-name">
                        <Marked text={c.name || "Unnamed"} query={searchQuery} />
                      </span>
                      {meta && <span className="hs-meta">{meta}</span>}
                    </span>
                    <span className="hs-tags">
                      {c.po ? <span className="hs-tag">PO {c.po}</span> : null}
                      {c.status ? <span className="hs-tag">{c.status}</span> : null}
                    </span>
                  </button>
                );
              })}
              <div className="hs-foot">↑ ↓ to move · Enter to open in Master P.O Sheet</div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
