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
  PasteProgressOverlay,
  SheetCaptureField,
  ResetColumnsButton,
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
  statusExcluded,
  fmtDate,
  normalizeCandidate,
  newId,
} from "@/lib/crm";
import type { Candidate } from "@/lib/crm/types";

const COLUMNS: {
  key: string;
  label: string;
  className?: string;
  render: (x: Candidate, onEditRemarks: (id: number, v: string) => void) => React.ReactNode;
}[] = [
  { key: "assignedTo", label: "Assigned", render: (x) => x.assignedTo },
  { key: "candidate", label: "Candidate", render: (x) => <strong>{x.name}</strong> },
  { key: "floor", label: "Floor", render: (x) => x.floor || "-" },
  { key: "po", label: "P.O", render: (x) => x.po || "-" },
  {
    key: "totalFee",
    label: "Total Fee",
    className: "accent-text",
    render: (x) => money(x.totalServiceFee),
  },
  {
    key: "paid",
    label: "Paid",
    className: "success-text",
    render: (x) => money(getTotalPaid(x)),
  },
  {
    key: "remaining",
    label: "Remaining",
    className: "danger-text",
    render: (x) => money(getRemaining(x)),
  },
  { key: "lastPay", label: "Last Pay", render: (x) => fmtDate(getLastPaymentDate(x)) },
  { key: "nextDue", label: "Next Due", render: (x) => fmtDate(getNextDueDate(x)) },
  { key: "status", label: "Status", render: (x) => <Badge label={getComplianceStatus(x)} /> },
  {
    key: "remarks",
    label: "Remarks",
    render: (x, onEditRemarks) => (
      <input
        className="target-input remarks sheet-cell"
        value={x.remarks || ""}
        placeholder="Remarks"
        onChange={(e) => onEditRemarks(x.id, e.target.value)}
      />
    ),
  },
];

export function Compliance() {
  const { filtered, updateMasterField, candidates, setCandidates, queueSave, snapshot, toast } =
    useCrm();
  const list = filtered().filter(
    (x) => !statusExcluded(x.status) && getRemaining(x) > 0
  );
  const { fullscreen, toggleFullscreen, shellCls } = useFullscreen();
  const rows = list;
  const { order, gripProps, headerProps, resetOrder } = useColumnOrder(
    "complianceColumnOrder",
    COLUMNS.map((c) => c.key)
  );
  const { colStyle, resizeHandleProps, resetWidths } = useColumnWidths(
    "complianceColumnWidths",
    COLUMNS.map((c) => c.key),
    { candidate: 180, remarks: 220, default: 140 }
  );
  const columnsByKey = new Map(COLUMNS.map((c) => [c.key, c]));
  const orderedColumns = order.map((k) => columnsByKey.get(k)!);
  const onEditRemarks = (id: number, v: string) => updateMasterField(id, "remarks", v);

  // Same select/copy/paste workflow as Master P.O Sheet (see useSheetGrid) -
  // Remarks is this page's only editable field, the rest are computed/badge
  // columns so paste just skips them.
  const sheetColumns: SheetColumn<Candidate>[] = [
    { key: "assignedTo", editable: false, getText: (x) => x.assignedTo || "" },
    { key: "candidate", editable: false, getText: (x) => x.name || "" },
    { key: "floor", editable: false, getText: (x) => x.floor || "" },
    { key: "po", editable: false, getText: (x) => x.po || "" },
    { key: "totalFee", editable: false, getText: (x) => money(x.totalServiceFee) },
    { key: "paid", editable: false, getText: (x) => money(getTotalPaid(x)) },
    { key: "remaining", editable: false, getText: (x) => money(getRemaining(x)) },
    { key: "lastPay", editable: false, getText: (x) => fmtDate(getLastPaymentDate(x)) },
    { key: "nextDue", editable: false, getText: (x) => fmtDate(getNextDueDate(x)) },
    { key: "status", editable: false, getText: (x) => getComplianceStatus(x) },
    {
      key: "remarks",
      editable: true,
      getText: (x) => x.remarks || "",
      applyText: (x, v) => {
        x.remarks = v;
      },
    },
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
      {!fullscreen && <FiltersBar />}
      <DataTableContainer
        title="Compliance Sheet"
        subtitle="Auto-generated from Master"
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
        <CrmTable resizable selectable>
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
              rows.map((x, rowIdx) => (
                <tr key={x.id}>
                  {orderedColumns.map((col, colIdx) => (
                    <td
                      key={col.key}
                      {...cellProps(rowIdx, colIdx)}
                      className={`${col.className || ""} ${isCellSelected(rowIdx, colIdx) ? "cell-selected" : ""}`}
                    >
                      {col.render(x, onEditRemarks)}
                    </td>
                  ))}
                </tr>
              ))
            ) : (
              <EmptyTableRow colSpan={11} message="No active compliance rows." />
            )}
          </tbody>
        </CrmTable>
      </DataTableContainer>
      <SheetCaptureField {...captureProps} />
      <PasteProgressOverlay pasteProgress={pasteProgress} />
    </div>
  );
}
