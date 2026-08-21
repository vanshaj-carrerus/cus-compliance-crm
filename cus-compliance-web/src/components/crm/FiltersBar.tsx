"use client";

import type { ReactNode } from "react";
import { useCrm } from "./CrmProvider";
import { DEFAULT_STATUSES } from "@/lib/crm/types";

export function FiltersBar({ children }: { children?: ReactNode }) {
  const { candidates, activeFilters, setActiveFilters } = useCrm();
  const floors = [...new Set(candidates.map((c) => c.floor).filter(Boolean))].sort();
  const pos = [...new Set(candidates.map((c) => c.po).filter(Boolean))].sort();
  const months = [
    ...new Set(candidates.map((c) => c.poMonth).filter(Boolean)),
  ].sort();
  const statuses = [
    ...new Set([
      ...DEFAULT_STATUSES.filter((s) => s !== "Custom"),
      ...candidates.map((c) => c.status).filter(Boolean),
    ]),
  ];

  const set = (key: string, value: string) => {
    const next = { ...activeFilters };
    if (value) (next as Record<string, string>)[key] = value;
    else delete (next as Record<string, string>)[key];
    setActiveFilters(next);
  };

  return (
    <div className="filters-bar">
      <label className="filter-group">
        <span className="filter-label">Assigned</span>
        <select
          value={activeFilters.assignedTo || ""}
          onChange={(e) => set("assignedTo", e.target.value)}
        >
          <option value="">All</option>
          <option>Yatin</option>
          <option>Jayraj</option>
        </select>
      </label>
      <label className="filter-group">
        <span className="filter-label">Floor</span>
        <select
          value={activeFilters.floor || ""}
          onChange={(e) => set("floor", e.target.value)}
        >
          <option value="">All</option>
          {floors.map((v) => (
            <option key={v}>{v}</option>
          ))}
        </select>
      </label>
      <label className="filter-group">
        <span className="filter-label">Status</span>
        <select
          value={activeFilters.status || ""}
          onChange={(e) => set("status", e.target.value)}
        >
          <option value="">All</option>
          {statuses.map((v) => (
            <option key={v}>{v}</option>
          ))}
        </select>
      </label>
      <label className="filter-group">
        <span className="filter-label">PO</span>
        <select
          value={activeFilters.po || ""}
          onChange={(e) => set("po", e.target.value)}
        >
          <option value="">All</option>
          {pos.map((v) => (
            <option key={v}>{v}</option>
          ))}
        </select>
      </label>
      <label className="filter-group">
        <span className="filter-label">P.O Month</span>
        <select
          value={activeFilters.poMonth || ""}
          onChange={(e) => set("poMonth", e.target.value)}
        >
          <option value="">All Months</option>
          {months.map((v) => (
            <option key={v}>{v}</option>
          ))}
        </select>
      </label>
      <button
        type="button"
        className="btn btn-secondary btn-sm"
        onClick={() => setActiveFilters({})}
      >
        Clear Filters
      </button>
      {children}
    </div>
  );
}
