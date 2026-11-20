"use client";

import { useEffect } from "react";
import { useCrm } from "./CrmProvider";
import {
  addDays,
  downloadBlob,
  exportCandidatesCsv,
  normalizeCandidate,
  todayIso,
} from "@/lib/crm";
import type { Candidate } from "@/lib/crm/types";

const STATUSES = [
  "Active",
  "Fully Paid",
  "Run Away",
  "No Response",
  "Job Lost",
  "Cancelled",
  "Refunded",
  "Closed",
  "Inactive",
];

/** Width of the checkbox column - every sheet that shows it uses the same one. */
export const BULK_COL_WIDTH: React.CSSProperties = {
  width: 44,
  minWidth: 44,
  maxWidth: 44,
  textAlign: "center",
};

/**
 * Selection state for a sheet's checkbox column, shared by every page that
 * offers bulk actions. `visibleIds` is what the page currently lists - the
 * "select all" box and the actions only ever touch those rows, so a candidate
 * hidden by a filter can never be deleted by accident.
 */
export function useBulkSelection(
  selected: Set<string>,
  setSelected: (s: Set<string>) => void,
  visibleIds: number[]
) {
  const visible = visibleIds.map(String);
  const selectedVisible = visible.filter((id) => selected.has(id));
  const allChecked = visible.length > 0 && selectedVisible.length === visible.length;
  const someChecked = selectedVisible.length > 0 && !allChecked;

  const toggleOne = (id: number | string, checked: boolean) => {
    const next = new Set(selected);
    if (checked) next.add(String(id));
    else next.delete(String(id));
    setSelected(next);
  };

  const toggleAll = (checked: boolean) => {
    const next = new Set(selected);
    visible.forEach((id) => (checked ? next.add(id) : next.delete(id)));
    setSelected(next);
  };

  return {
    isSelected: (id: number | string) => selected.has(String(id)),
    toggleOne,
    toggleAll,
    allChecked,
    someChecked,
    selectedIds: new Set(selectedVisible),
    count: selectedVisible.length,
  };
}

/** Header checkbox ("select every row currently shown"). */
export function BulkHeaderCheck({
  allChecked,
  someChecked,
  onToggle,
}: {
  allChecked: boolean;
  someChecked: boolean;
  onToggle: (checked: boolean) => void;
}) {
  return (
    <th style={BULK_COL_WIDTH}>
      <input
        type="checkbox"
        aria-label="Select all rows"
        title="Select / deselect all rows shown"
        checked={allChecked}
        ref={(el) => {
          if (el) el.indeterminate = someChecked;
        }}
        onChange={(e) => onToggle(e.target.checked)}
      />
    </th>
  );
}

/** Per-row checkbox cell. */
export function BulkRowCheck({
  checked,
  onToggle,
}: {
  checked: boolean;
  onToggle: (checked: boolean) => void;
}) {
  return (
    <td style={BULK_COL_WIDTH}>
      <input
        type="checkbox"
        aria-label="Select row"
        checked={checked}
        onChange={(e) => onToggle(e.target.checked)}
      />
    </td>
  );
}

/**
 * Floating action bar for the selected candidates. Every action is applied to
 * the selected rows only. `selectedIds` should come from useBulkSelection.
 */
export function BulkActionBar({
  selectedIds,
  clear,
}: {
  selectedIds: Set<string>;
  clear: () => void;
}) {
  const {
    candidates,
    setCandidates,
    history,
    setHistory,
    snapshot,
    queueSave,
    toast,
    assignableUsers,
  } = useCrm();

  // Selection belongs to the page it was made on - start every page empty
  // (the selection is shared with Master P.O Sheet) and drop it when leaving.
  useEffect(() => {
    clear();
    return clear;
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (selectedIds.size === 0) return null;

  const selected: Candidate[] = candidates.filter((c) => selectedIds.has(String(c.id)));

  const apply = (fn: (c: Candidate) => Candidate) => {
    snapshot();
    setCandidates(
      candidates.map((c) => (selectedIds.has(String(c.id)) ? normalizeCandidate(fn(c)) : c))
    );
    queueSave();
    toast("Bulk update completed", "success");
  };

  return (
    <div className="fixed bottom-4 left-1/2 z-3900 flex w-[min(1000px,calc(100vw-28px))] -translate-x-1/2 flex-wrap items-center gap-2 rounded-[20px] border border-border bg-card px-3.5 py-3 shadow-2xl">
      <div className="mr-auto font-black">
        {selected.length} candidate{selected.length === 1 ? "" : "s"} selected
      </div>
      <select
        className="rounded border border-border bg-input px-2 py-1 text-sm"
        defaultValue=""
        onChange={(e) => {
          const value = e.target.value;
          e.target.value = "";
          if (!value) return;
          if (!confirm(`Set status to "${value}" for ${selected.length} selected?`)) return;
          apply((c) => ({
            ...c,
            status: value,
            nextFollowUpDate: ["Run Away", "No Response"].includes(value)
              ? addDays(todayIso(), 7)
              : c.nextFollowUpDate,
          }));
        }}
      >
        <option value="">Change Status</option>
        {STATUSES.map((v) => (
          <option key={v}>{v}</option>
        ))}
      </select>
      <select
        className="rounded border border-border bg-input px-2 py-1 text-sm"
        defaultValue=""
        onChange={(e) => {
          const value = e.target.value;
          e.target.value = "";
          if (!value) return;
          apply((c) => ({ ...c, assignedTo: value }));
        }}
      >
        <option value="">Change Assigned</option>
        {assignableUsers.map((name) => (
          <option key={name}>{name}</option>
        ))}
      </select>
      <button
        type="button"
        className="rounded border border-border bg-secondary px-3 py-1.5 text-xs"
        onClick={() => {
          downloadBlob(
            exportCandidatesCsv(selected),
            "careerus_selected_" + todayIso() + ".csv",
            "text/csv;charset=utf-8"
          );
          toast("Selected candidates exported", "success");
        }}
      >
        Export Selected
      </button>
      <button
        type="button"
        className="rounded bg-danger px-3 py-1.5 text-xs text-white"
        onClick={() => {
          if (
            !confirm(`Delete ${selected.length} selected candidate${selected.length === 1 ? "" : "s"}?`) ||
            !confirm("Final confirmation? This also removes their payment history.")
          )
            return;
          snapshot();
          setCandidates(candidates.filter((c) => !selectedIds.has(String(c.id))));
          setHistory(history.filter((h) => !selectedIds.has(String(h.candidateId))));
          clear();
          queueSave();
          toast("Selected candidates deleted", "success");
        }}
      >
        Delete Selected
      </button>
      <button
        type="button"
        className="rounded border border-border bg-secondary px-3 py-1.5 text-xs"
        onClick={clear}
      >
        Clear
      </button>
    </div>
  );
}
