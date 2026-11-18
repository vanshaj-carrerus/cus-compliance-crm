"use client";

import type { ReactNode } from "react";
import {
  BellRing,
  Building2,
  CalendarDays,
  CircleDot,
  FileText,
  PhoneCall,
  UserRound,
  type LucideIcon,
} from "lucide-react";
import { useCrm } from "./CrmProvider";
import { ColumnsMenu } from "./ColumnVisibility";
import { DEFAULT_STATUSES } from "@/lib/crm/types";

// One filter: normally "LABEL [select]". With iconOnly it shows just an icon
// (full name stays for screen readers and appears as a tooltip on hover of
// the icon or the dropdown).
export function FilterGroup({
  text,
  icon: Icon,
  iconOnly,
  children,
}: {
  text: string;
  icon: LucideIcon;
  iconOnly?: boolean;
  children: ReactNode;
}) {
  if (!iconOnly) {
    return (
      <label className="filter-group">
        <span className="filter-label">{text}</span>
        {children}
      </label>
    );
  }
  return (
    <label className="filter-group filter-group-icon" title={text}>
      <span className="filter-icon">
        <Icon size={16} strokeWidth={2.2} aria-hidden="true" />
        <span className="sr-only">{text}</span>
      </span>
      {children}
    </label>
  );
}

export const FILTER_ICONS = {
  followUp: BellRing,
  contactMethod: PhoneCall,
};

export function FiltersBar({
  children,
  iconOnly = true,
  embedded = false,
}: {
  children?: ReactNode;
  iconOnly?: boolean;
  // Renders without its own card so it can sit inside another toolbar.
  embedded?: boolean;
}) {
  const { candidates, activeFilters, setActiveFilters, assignableUsers } = useCrm();
  const assignees = [
    ...new Set([
      ...assignableUsers,
      ...candidates.map((c) => c.assignedTo).filter(Boolean),
    ]),
  ].sort();
  const floors = [...new Set(candidates.map((c) => c.floor).filter(Boolean))].sort();
  const pos = [...new Set(candidates.map((c) => c.po).filter(Boolean))].sort();
  const months = [
    ...new Set(candidates.map((c) => c.poMonth).filter(Boolean)),
  ].sort();
  const statuses = [
    ...new Set([
      // A blank status is shown as "Active" in the sheet, so it must be
      // filterable as "Active" too.
      "Active",
      ...DEFAULT_STATUSES,
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
    <div className={`filters-bar ${embedded ? "filters-bar-embedded" : ""}`}>
      <FilterGroup text="Assigned" icon={UserRound} iconOnly={iconOnly}>
        <select
          value={activeFilters.assignedTo || ""}
          onChange={(e) => set("assignedTo", e.target.value)}
        >
          <option value="">All</option>
          {assignees.map((v) => (
            <option key={v}>{v}</option>
          ))}
        </select>
      </FilterGroup>
      <FilterGroup text="Floor" icon={Building2} iconOnly={iconOnly}>
        <select
          value={activeFilters.floor || ""}
          onChange={(e) => set("floor", e.target.value)}
        >
          <option value="">All</option>
          {floors.map((v) => (
            <option key={v}>{v}</option>
          ))}
        </select>
      </FilterGroup>
      <FilterGroup text="Status" icon={CircleDot} iconOnly={iconOnly}>
        <select
          value={activeFilters.status || ""}
          onChange={(e) => set("status", e.target.value)}
        >
          <option value="">All</option>
          {statuses.map((v) => (
            <option key={v}>{v}</option>
          ))}
        </select>
      </FilterGroup>
      <FilterGroup text="PO" icon={FileText} iconOnly={iconOnly}>
        <select
          value={activeFilters.po || ""}
          onChange={(e) => set("po", e.target.value)}
        >
          <option value="">All</option>
          {pos.map((v) => (
            <option key={v}>{v}</option>
          ))}
        </select>
      </FilterGroup>
      <FilterGroup text="P.O Month" icon={CalendarDays} iconOnly={iconOnly}>
        <select
          value={activeFilters.poMonth || ""}
          onChange={(e) => set("poMonth", e.target.value)}
        >
          <option value="">All Months</option>
          {months.map((v) => (
            <option key={v}>{v}</option>
          ))}
        </select>
      </FilterGroup>
      <button
        type="button"
        className="btn btn-secondary btn-sm"
        onClick={() => setActiveFilters({})}
      >
        Clear Filters
      </button>
      <ColumnsMenu />
      {children}
    </div>
  );
}
