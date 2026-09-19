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
  getTotalPaid,
  getRemaining,
  getLastPaymentDate,
  getNextDueDate,
  getComplianceStatus,
  applyPaidAmount,
  statusExcluded,
  fmtDate,
  normalizeCandidate,
  newId,
} from "@/lib/crm";
import type { Candidate } from "@/lib/crm/types";

export function Compliance() {
  const {
    filtered,
    updateMasterField,
    setPaidAmount,
    candidates,
    setCandidates,
    queueSave,
    snapshot,
    toast,
    assignableUsers,
  } = useCrm();
  const list = filtered().filter(
    (x) => !statusExcluded(x.status) && getRemaining(x) > 0
  );
  const { fullscreen, toggleFullscreen, shellCls } = useFullscreen();
  const rows = list;

  // Every stored field (Assigned, Candidate, Floor, P.O, Total Fee, Remarks)
  // is directly editable here, same as Master P.O Sheet. Paid/Remaining/Last
  // Pay/Next Due/Status are derived from the installment schedule, not
  // stored values, so they stay read-only - edit installments on Master to
  // change them.
  const COLUMNS: {
    key: string;
    label: string;
    className?: string;
    render: (x: Candidate) => React.ReactNode;
  }[] = [
    {
      key: "assignedTo",
      label: "Assigned",
      render: (x) => (
        <select
          className="sheet-cell"
          value={x.assignedTo || ""}
          onChange={(e) => updateMasterField(x.id, "assignedTo", e.target.value)}
        >
          <option value="">-</option>
          {[
            ...new Set(
              x.assignedTo ? [...assignableUsers, x.assignedTo] : assignableUsers
            ),
          ].map((name) => (
            <option key={name}>{name}</option>
          ))}
        </select>
      ),
    },
    {
      key: "candidate",
      label: "Candidate",
      render: (x) => (
        <input
          className="sheet-cell name-priority"
          defaultValue={x.name || ""}
          key={x.id + "-name-" + (x.name || "")}
          onBlur={(e) =>
            e.target.value !== (x.name || "") &&
            updateMasterField(x.id, "name", e.target.value)
          }
        />
      ),
    },
    {
      key: "floor",
      label: "Floor",
      render: (x) => (
        <input
          className="sheet-cell"
          defaultValue={x.floor || ""}
          key={x.id + "-floor-" + (x.floor || "")}
          onBlur={(e) =>
            e.target.value !== (x.floor || "") &&
            updateMasterField(x.id, "floor", e.target.value)
          }
        />
      ),
    },
    {
      key: "po",
      label: "P.O",
      render: (x) => (
        <input
          className="sheet-cell"
          defaultValue={x.po || ""}
          key={x.id + "-po-" + (x.po || "")}
          onBlur={(e) =>
            e.target.value !== (x.po || "") &&
            updateMasterField(x.id, "po", e.target.value)
          }
        />
      ),
    },
    {
      key: "totalFee",
      label: "Total Fee",
      className: "accent-text",
      render: (x) => (
        <input
          className="sheet-cell"
          defaultValue={x.totalServiceFee ? String(x.totalServiceFee) : ""}
          key={x.id + "-totalFee-" + (x.totalServiceFee || "")}
          onBlur={(e) => {
            if (e.target.value === (x.totalServiceFee ? String(x.totalServiceFee) : "")) return;
            updateMasterField(x.id, "totalServiceFee", e.target.value);
          }}
        />
      ),
    },
    {
      key: "paid",
      label: "Paid",
      className: "success-text",
      render: (x) => (
        <input
          className="sheet-cell success-text"
          defaultValue={String(getTotalPaid(x))}
          key={x.id + "-paid-" + getTotalPaid(x)}
          title="Editing this marks/unmarks installments (earliest first) until their paid sum matches what you type"
          onBlur={(e) => {
            const parsed = Number(String(e.target.value).replace(/[$,%\s,]/g, "")) || 0;
            if (parsed === getTotalPaid(x)) return;
            setPaidAmount(x.id, parsed);
          }}
        />
      ),
    },
    {
      key: "remaining",
      label: "Remaining",
      className: "danger-text",
      render: (x) => (
        <input
          className="sheet-cell danger-text"
          defaultValue={String(getRemaining(x))}
          key={x.id + "-remaining-" + getRemaining(x)}
          title="Editing this backs into a new Total Fee (Total = Paid + what you type here)"
          onBlur={(e) => {
            const parsed = Number(String(e.target.value).replace(/[$,%\s,]/g, "")) || 0;
            if (parsed === getRemaining(x)) return;
            updateMasterField(x.id, "totalServiceFee", String(getTotalPaid(x) + parsed));
          }}
        />
      ),
    },
    {
      key: "lastPay",
      label: "Last Pay",
      render: (x) => (
        <div className="sheet-cell calc-cell" title="Derived from paid installments">
          {fmtDate(getLastPaymentDate(x))}
        </div>
      ),
    },
    {
      key: "nextDue",
      label: "Next Due",
      render: (x) => (
        <div className="sheet-cell calc-cell" title="Derived from unpaid installment dates">
          {fmtDate(getNextDueDate(x))}
        </div>
      ),
    },
    {
      key: "status",
      label: "Status",
      render: (x) => (
        <div title="Derived from Remaining and Next Due - not directly editable">
          <Badge label={getComplianceStatus(x)} />
        </div>
      ),
    },
    {
      key: "remarks",
      label: "Remarks",
      render: (x) => (
        <input
          className="target-input remarks sheet-cell"
          value={x.remarks || ""}
          placeholder="Remarks"
          onChange={(e) => updateMasterField(x.id, "remarks", e.target.value)}
        />
      ),
    },
  ];

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

  // Same select/copy/paste workflow as Master P.O Sheet (see useSheetGrid).
  // Every stored field is editable/pasteable; the derived columns
  // (Paid/Remaining/Last Pay/Next Due/Status) are read-only so paste skips
  // them, same as Master does for its own computed columns.
  const sheetColumns: SheetColumn<Candidate>[] = [
    {
      key: "assignedTo",
      editable: true,
      getText: (x) => x.assignedTo || "",
      applyText: (x, v) => {
        x.assignedTo = v as Candidate["assignedTo"];
      },
    },
    {
      key: "candidate",
      editable: true,
      getText: (x) => x.name || "",
      applyText: (x, v) => {
        x.name = v;
      },
    },
    {
      key: "floor",
      editable: true,
      getText: (x) => x.floor || "",
      applyText: (x, v) => {
        x.floor = v;
      },
    },
    {
      key: "po",
      editable: true,
      getText: (x) => x.po || "",
      applyText: (x, v) => {
        x.po = v;
      },
    },
    {
      key: "totalFee",
      editable: true,
      getText: (x) => (x.totalServiceFee ? String(x.totalServiceFee) : ""),
      applyText: (x, v) => {
        x.totalServiceFee = Number(String(v).replace(/[$,%\s,]/g, "")) || 0;
        x.annualPackage = 0;
        x.serviceFeePercent = 0;
      },
    },
    {
      key: "paid",
      editable: true,
      getText: (x) => String(getTotalPaid(x)),
      applyText: (x, v) => {
        const parsed = Number(String(v).replace(/[$,%\s,]/g, "")) || 0;
        applyPaidAmount(x, parsed);
      },
    },
    {
      key: "remaining",
      editable: true,
      getText: (x) => String(getRemaining(x)),
      applyText: (x, v) => {
        const parsed = Number(String(v).replace(/[$,%\s,]/g, "")) || 0;
        x.totalServiceFee = getTotalPaid(x) + parsed;
        x.annualPackage = 0;
        x.serviceFeePercent = 0;
      },
    },
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
                      {col.render(x)}
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
