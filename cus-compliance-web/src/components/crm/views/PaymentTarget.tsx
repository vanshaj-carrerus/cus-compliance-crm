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
  getDefaultExpectedDate,
  applyPaidAmount,
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
    setPaidAmount,
    candidates,
    setCandidates,
    queueSave,
    snapshot,
    toast,
    showAddModal,
    assignableUsers,
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
    {
      key: "assignedTo",
      label: "Assigned",
      render: (r) => (
        <select
          className="sheet-cell"
          value={r.x.assignedTo || ""}
          onChange={(e) => updateMasterField(r.x.id, "assignedTo", e.target.value)}
        >
          <option value="">-</option>
          {[
            ...new Set(
              r.x.assignedTo
                ? [...assignableUsers, r.x.assignedTo]
                : assignableUsers
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
      render: (r) => (
        <input
          className="sheet-cell name-priority"
          defaultValue={r.x.name || ""}
          key={r.x.id + "-name-" + (r.x.name || "")}
          onBlur={(e) =>
            e.target.value !== (r.x.name || "") &&
            updateMasterField(r.x.id, "name", e.target.value)
          }
        />
      ),
    },
    {
      key: "phoneNumber",
      label: "Phone Number",
      render: (r) => (
        <input
          className="sheet-cell"
          defaultValue={r.x.phoneNumber || ""}
          key={r.x.id + "-phoneNumber-" + (r.x.phoneNumber || "")}
          onBlur={(e) =>
            e.target.value !== (r.x.phoneNumber || "") &&
            updateMasterField(r.x.id, "phoneNumber", e.target.value)
          }
        />
      ),
    },
    {
      key: "installmentDue",
      label: "Installment Amount",
      className: "accent-text",
      render: (r) => (
        <div
          className="sheet-cell calc-cell accent-text"
          title="Sum of unpaid installments due through the selected month - not editable, edit installments on Master P.O Sheet instead"
        >
          {r.due ? money(r.due) : "-"}
        </div>
      ),
    },
    {
      key: "expectedDate",
      label: "Expected Date",
      render: (r) => (
        <input
          type="date"
          className="target-input date sheet-cell"
          value={r.x.expectedDate || getDefaultExpectedDate(r.x)}
          title="Defaults to one month after the last payment - edit to override"
          onChange={(e) => updateMasterField(r.x.id, "expectedDate", e.target.value)}
        />
      ),
    },
    {
      key: "monthRemarks",
      label: "Remarks",
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
      key: "floor",
      label: "Floor",
      render: (r) => (
        <input
          className="sheet-cell"
          defaultValue={r.x.floor || ""}
          key={r.x.id + "-floor-" + (r.x.floor || "")}
          onBlur={(e) =>
            e.target.value !== (r.x.floor || "") &&
            updateMasterField(r.x.id, "floor", e.target.value)
          }
        />
      ),
    },
    {
      key: "po",
      label: "P.O",
      render: (r) => (
        <input
          className="sheet-cell"
          defaultValue={r.x.po || ""}
          key={r.x.id + "-po-" + (r.x.po || "")}
          onBlur={(e) =>
            e.target.value !== (r.x.po || "") &&
            updateMasterField(r.x.id, "po", e.target.value)
          }
        />
      ),
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
      key: "paid",
      label: "Paid",
      className: "success-text",
      render: (r) => (
        <input
          className="sheet-cell success-text"
          defaultValue={String(getTotalPaid(r.x))}
          key={r.x.id + "-paid-" + getTotalPaid(r.x)}
          title="Editing this marks/unmarks installments (earliest first) until their paid sum matches what you type"
          onBlur={(e) => {
            const parsed = Number(String(e.target.value).replace(/[$,%\s,]/g, "")) || 0;
            if (parsed === getTotalPaid(r.x)) return;
            setPaidAmount(r.x.id, parsed);
          }}
        />
      ),
    },
    {
      key: "remaining",
      label: "Remaining",
      className: "danger-text",
      render: (r) => (
        <input
          className="sheet-cell danger-text"
          defaultValue={String(getRemaining(r.x))}
          key={r.x.id + "-remaining-" + getRemaining(r.x)}
          title="Editing this backs into a new Total Fee (Total = Paid + what you type here)"
          onBlur={(e) => {
            const parsed = Number(String(e.target.value).replace(/[$,%\s,]/g, "")) || 0;
            if (parsed === getRemaining(r.x)) return;
            updateMasterField(
              r.x.id,
              "totalServiceFee",
              String(getTotalPaid(r.x) + parsed)
            );
          }}
        />
      ),
    },
    {
      key: "lastPayment",
      label: "Last Payment",
      render: (r) => (
        <div className="sheet-cell calc-cell" title="Derived from paid installments">
          {fmtDate(getLastPaymentDate(r.x))}
        </div>
      ),
    },
    {
      key: "nextPayment",
      label: "Next Payment",
      render: (r) => (
        <div className="sheet-cell calc-cell" title="Derived from unpaid installment dates">
          {fmtDate(getNextDueDate(r.x))}
        </div>
      ),
    },
    {
      key: "status",
      label: "Status",
      render: (r) => (
        <div title="Derived from Remaining and Next Due - not directly editable">
          <Badge label={getComplianceStatus(r.x)} />
        </div>
      ),
    },
    {
      key: "priority",
      label: "Priority",
      className: (r) => priorityClass(r.pri),
      render: (r) => (
        <div className="sheet-cell calc-cell" title="Derived from the next due date">
          {r.pri}
        </div>
      ),
    },
  ];
  const { order, gripProps, headerProps, resetOrder } = useColumnOrder(
    // Bumped key so the new default column order (Assigned/Candidate/Phone/
    // Installment Amount/Expected Date/Remarks first) actually takes effect
    // for anyone who already had the old order saved locally.
    "paymentTargetColumnOrderV2",
    columns.map((c) => c.key)
  );
  const { colStyle, resizeHandleProps, resetWidths } = useColumnWidths(
    "paymentTargetColumnWidths",
    columns.map((c) => c.key),
    { candidate: 180, monthRemarks: 220, default: 140 }
  );
  const columnsByKey = new Map(columns.map((c) => [c.key, c]));
  const orderedColumns = order.map((k) => columnsByKey.get(k)!);

  // Same select/copy/paste workflow as Master P.O Sheet (see useSheetGrid).
  // Every stored field is editable/pasteable; the derived columns
  // (Installment Due/Paid/Remaining/Last Payment/Next Payment/Status/
  // Priority) are read-only so paste skips them, same as Master does for
  // its own computed columns.
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
      key: "phoneNumber",
      editable: true,
      getText: (x) => x.phoneNumber || "",
      applyText: (x, v) => {
        x.phoneNumber = v;
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
      getText: (x) => x.expectedDate || getDefaultExpectedDate(x),
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
            <button
              type="button"
              title="Manually add a new candidate here"
              className="rounded border border-border bg-secondary px-3 py-1.5 text-xs"
              onClick={showAddModal}
            >
              ➕ Add Candidate
            </button>
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
