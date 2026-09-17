"use client";

import { useCrm } from "../CrmProvider";
import { FiltersBar } from "../FiltersBar";
import {
  Badge,
  ColumnResizeHandle,
  CrmTable,
  DataTableContainer,
  EmptyTableRow,
  FullscreenButton,
  FullscreenExitFab,
  MonthSelector,
  PasteProgressOverlay,
  ResetColumnsButton,
  SheetCaptureField,
  TableCountBar,
  useColumnOrder,
  useColumnWidths,
  useFullscreen,
  useSheetGrid,
  type SheetColumn,
} from "../shared";
import {
  money,
  getTotalPaid,
  getRemaining,
  getLastPaymentDate,
  getNextDueDate,
  getComplianceStatus,
  getDueForMonth,
  priority,
  statusExcluded,
  fmtDate,
  fmtMonth,
  normalizeCandidate,
  newId,
} from "@/lib/crm";
import type { Candidate } from "@/lib/crm/types";

function priorityClass(pri: string) {
  if (pri === "Red") return "danger-text";
  if (pri === "Orange") return "warning-text";
  if (pri === "Yellow") return "muted";
  return "success-text";
}

export function PaymentTarget() {
  const {
    filtered,
    settings,
    updateSettings,
    updateMasterField,
    candidates,
    setCandidates,
    queueSave,
    snapshot,
    toast,
  } = useCrm();
  const d = new Date(settings.targetMonth);
  const list = filtered().filter(
    (x) => !statusExcluded(x.status) && getRemaining(x) > 0
  );
  const shiftMonth = (delta: number) => {
    const next = new Date(d);
    next.setMonth(next.getMonth() + delta);
    updateSettings({ targetMonth: next.toISOString() });
  };
  const { fullscreen, toggleFullscreen, shellCls } = useFullscreen();
  const rows = list;

  type Row = { x: Candidate; due: number; pri: string };
  const columns: {
    key: string;
    label: string;
    className?: string | ((r: Row) => string);
    render: (r: Row) => React.ReactNode;
  }[] = [
    { key: "assignedTo", label: "Assigned", render: (r) => r.x.assignedTo },
    { key: "candidate", label: "Candidate", render: (r) => <strong>{r.x.name}</strong> },
    { key: "floor", label: "Floor", render: (r) => r.x.floor || "-" },
    { key: "po", label: "P.O", render: (r) => r.x.po || "-" },
    {
      key: "installmentDue",
      label: "Installment Due",
      className: "accent-text",
      render: (r) => (r.due ? money(r.due) : "-"),
    },
    {
      key: "expectedAmount",
      label: "Expected Amount",
      render: (r) => (
        <input
          className="target-input sheet-cell"
          value={String(r.x.expectedAmount ?? "")}
          placeholder="$ expected"
          onChange={(e) =>
            updateMasterField(r.x.id, "expectedAmount", e.target.value)
          }
        />
      ),
    },
    {
      key: "expectedDate",
      label: "Expected Date",
      render: (r) => (
        <input
          type="date"
          className="target-input date sheet-cell"
          value={r.x.expectedDate || ""}
          onChange={(e) => updateMasterField(r.x.id, "expectedDate", e.target.value)}
        />
      ),
    },
    {
      key: "monthRemarks",
      label: "Month Remarks",
      render: (r) => (
        <input
          className="target-input remarks sheet-cell"
          value={r.x.monthRemarks || ""}
          placeholder="Monthly remarks"
          onChange={(e) => updateMasterField(r.x.id, "monthRemarks", e.target.value)}
        />
      ),
    },
    {
      key: "paid",
      label: "Paid",
      className: "success-text",
      render: (r) => money(getTotalPaid(r.x)),
    },
    {
      key: "remaining",
      label: "Remaining",
      className: "danger-text",
      render: (r) => money(getRemaining(r.x)),
    },
    {
      key: "lastPayment",
      label: "Last Payment",
      render: (r) => fmtDate(getLastPaymentDate(r.x)),
    },
    {
      key: "nextPayment",
      label: "Next Payment",
      render: (r) => fmtDate(getNextDueDate(r.x)),
    },
    { key: "status", label: "Status", render: (r) => <Badge label={getComplianceStatus(r.x)} /> },
    {
      key: "priority",
      label: "Priority",
      className: (r) => priorityClass(r.pri),
      render: (r) => r.pri,
    },
  ];
  const { order, gripProps, headerProps, resetOrder } = useColumnOrder(
    "paymentTargetColumnOrder",
    columns.map((c) => c.key)
  );
  const { colStyle, resizeHandleProps, resetWidths } = useColumnWidths(
    "paymentTargetColumnWidths",
    columns.map((c) => c.key),
    { candidate: 180, monthRemarks: 220, default: 140 }
  );
  const columnsByKey = new Map(columns.map((c) => [c.key, c]));
  const orderedColumns = order.map((k) => columnsByKey.get(k)!);

  // Same select/copy/paste workflow as Master P.O Sheet (see useSheetGrid),
  // scoped to this page's three editable fields - the rest of the columns
  // are computed/read-only so paste just skips them, same as Master does
  // for its own non-editable columns.
  const sheetColumns: SheetColumn<Candidate>[] = [
    { key: "assignedTo", editable: false, getText: (x) => x.assignedTo || "" },
    { key: "candidate", editable: false, getText: (x) => x.name || "" },
    { key: "floor", editable: false, getText: (x) => x.floor || "" },
    { key: "po", editable: false, getText: (x) => x.po || "" },
    {
      key: "installmentDue",
      editable: false,
      getText: (x) => {
        const due = getDueForMonth(x, d);
        return due ? money(due) : "-";
      },
    },
    {
      key: "expectedAmount",
      editable: true,
      getText: (x) => (x.expectedAmount != null ? String(x.expectedAmount) : ""),
      applyText: (x, v) => {
        x.expectedAmount = v;
      },
    },
    {
      key: "expectedDate",
      editable: true,
      getText: (x) => x.expectedDate || "",
      applyText: (x, v) => {
        x.expectedDate = v;
      },
    },
    {
      key: "monthRemarks",
      editable: true,
      getText: (x) => x.monthRemarks || "",
      applyText: (x, v) => {
        x.monthRemarks = v;
      },
    },
    { key: "paid", editable: false, getText: (x) => money(getTotalPaid(x)) },
    { key: "remaining", editable: false, getText: (x) => money(getRemaining(x)) },
    { key: "lastPayment", editable: false, getText: (x) => fmtDate(getLastPaymentDate(x)) },
    { key: "nextPayment", editable: false, getText: (x) => fmtDate(getNextDueDate(x)) },
    { key: "status", editable: false, getText: (x) => getComplianceStatus(x) },
    { key: "priority", editable: false, getText: (x) => priority(x, d) },
  ];
  const sheetColumnsByKey = new Map(sheetColumns.map((c) => [c.key, c]));
  const orderedSheetColumns = order.map((k) => sheetColumnsByKey.get(k)!);

  const {
    scrollRef,
    isCellSelected,
    cellProps,
    captureProps,
    handlePaste,
    pasteProgress,
  } = useSheetGrid<Candidate>({
      rows,
      columns: orderedSheetColumns,
      allRows: candidates,
      setAllRows: setCandidates,
      queueSave,
      snapshot,
      toast,
      createBlankRow: () => normalizeCandidate({ id: newId() }),
      normalize: normalizeCandidate,
      overflowNote:
        "New candidates only show up here once they have Name/P.O/Month and a remaining balance set on Master P.O Sheet.",
    });

  return (
    <div className={shellCls}>
      <FullscreenExitFab fullscreen={fullscreen} onExit={toggleFullscreen} />
      {!fullscreen && (
        <>
          <MonthSelector
            label={fmtMonth(d)}
            onPrev={() => shiftMonth(-1)}
            onNext={() => shiftMonth(1)}
          />
          <FiltersBar />
        </>
      )}
      <DataTableContainer
        title={`Payment Target - ${fmtMonth(d)}`}
        subtitle="Carry-forward active until fully paid"
        fullscreen={fullscreen}
        scrollRef={scrollRef}
        onPaste={handlePaste}
        actions={
          <FullscreenButton fullscreen={fullscreen} onToggle={toggleFullscreen} />
        }
        toolbar={
          <TableCountBar total={list.length}>
            <ResetColumnsButton
              onReset={() => {
                resetOrder();
                resetWidths();
              }}
            />
          </TableCountBar>
        }
      >
        <CrmTable minWidth="1200px" resizable selectable>
          <thead>
            <tr>
              {orderedColumns.map((col) => {
                const hp = headerProps(col.key);
                return (
                  <th
                    key={col.key}
                    className={hp.className}
                    style={colStyle(col.key)}
                    onDragOver={hp.onDragOver}
                    onDrop={hp.onDrop}
                  >
                    <span
                      className="mr-1 inline-block cursor-grab select-none active:cursor-grabbing"
                      title="Drag to reorder this column"
                      {...gripProps(col.key)}
                    >
                      ⠿
                    </span>
                    {col.label}
                    <ColumnResizeHandle {...resizeHandleProps(col.key)} />
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {rows.length ? (
              rows.map((x, rowIdx) => {
                const row: Row = { x, due: getDueForMonth(x, d), pri: priority(x, d) };
                return (
                  <tr key={x.id}>
                    {orderedColumns.map((col, colIdx) => {
                      const cls =
                        typeof col.className === "function"
                          ? col.className(row)
                          : col.className;
                      return (
                        <td
                          key={col.key}
                          {...cellProps(rowIdx, colIdx)}
                          className={`${cls || ""} ${isCellSelected(rowIdx, colIdx) ? "cell-selected" : ""}`}
                        >
                          {col.render(row)}
                        </td>
                      );
                    })}
                  </tr>
                );
              })
            ) : (
              <EmptyTableRow
                colSpan={14}
                message="No candidates with remaining balance."
              />
            )}
          </tbody>
        </CrmTable>
      </DataTableContainer>
      <SheetCaptureField {...captureProps} />
      <PasteProgressOverlay pasteProgress={pasteProgress} />
    </div>
  );
}
