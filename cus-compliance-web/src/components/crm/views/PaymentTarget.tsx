"use client";

import { useCrm } from "../CrmProvider";
import { FiltersBar } from "../FiltersBar";
import {
  Badge,
  CrmTable,
  DataTableContainer,
  EmptyTableRow,
  FullscreenButton,
  FullscreenExitFab,
  MonthSelector,
  PaginationBar,
  ResetColumnsButton,
  useColumnOrder,
  useFullscreen,
  usePagination,
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
} from "@/lib/crm";
import type { Candidate } from "@/lib/crm/types";

function priorityClass(pri: string) {
  if (pri === "Red") return "danger-text";
  if (pri === "Orange") return "warning-text";
  if (pri === "Yellow") return "muted";
  return "success-text";
}

export function PaymentTarget() {
  const { filtered, settings, updateSettings, updateMasterField } = useCrm();
  const d = new Date(settings.targetMonth);
  const list = filtered().filter(
    (x) => !statusExcluded(x.status) && getRemaining(x) > 0
  );
  const { page, pageSize, pageCount, pageItems, setPage, setPageSize } =
    usePagination(list, 50);

  const shiftMonth = (delta: number) => {
    const next = new Date(d);
    next.setMonth(next.getMonth() + delta);
    updateSettings({ targetMonth: next.toISOString() });
  };
  const { fullscreen, toggleFullscreen, shellCls } = useFullscreen();
  const rows = fullscreen ? list : pageItems;

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
          className="target-input"
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
          className="target-input date"
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
          className="target-input remarks"
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
  const columnsByKey = new Map(columns.map((c) => [c.key, c]));
  const orderedColumns = order.map((k) => columnsByKey.get(k)!);

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
        actions={
          <FullscreenButton fullscreen={fullscreen} onToggle={toggleFullscreen} />
        }
        toolbar={
          <PaginationBar
            total={list.length}
            page={page}
            pageSize={pageSize}
            pageCount={pageCount}
            onPageChange={setPage}
            onPageSizeChange={setPageSize}
          >
            <ResetColumnsButton onReset={resetOrder} />
          </PaginationBar>
        }
      >
        <CrmTable minWidth="1200px">
          <thead>
            <tr>
              {orderedColumns.map((col) => {
                const hp = headerProps(col.key);
                return (
                  <th
                    key={col.key}
                    className={hp.className}
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
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {rows.length ? (
              rows.map((x) => {
                const row: Row = { x, due: getDueForMonth(x, d), pri: priority(x, d) };
                return (
                  <tr key={x.id}>
                    {orderedColumns.map((col) => (
                      <td
                        key={col.key}
                        className={
                          typeof col.className === "function"
                            ? col.className(row)
                            : col.className
                        }
                      >
                        {col.render(row)}
                      </td>
                    ))}
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
    </div>
  );
}
