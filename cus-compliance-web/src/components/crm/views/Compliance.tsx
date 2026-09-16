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
  PaginationBar,
  RemarksCell,
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
  statusExcluded,
  fmtDate,
} from "@/lib/crm";
import type { Candidate } from "@/lib/crm/types";

const COLUMNS: {
  key: string;
  label: string;
  className?: string;
  render: (x: Candidate) => React.ReactNode;
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
  { key: "remarks", label: "Remarks", render: (x) => <RemarksCell>{x.remarks}</RemarksCell> },
];

export function Compliance() {
  const { filtered } = useCrm();
  const list = filtered().filter(
    (x) => !statusExcluded(x.status) && getRemaining(x) > 0
  );
  const { page, pageSize, pageCount, pageItems, setPage, setPageSize } =
    usePagination(list, 50);
  const { fullscreen, toggleFullscreen, shellCls } = useFullscreen();
  const rows = fullscreen ? list : pageItems;
  const { order, gripProps, headerProps, resetOrder } = useColumnOrder(
    "complianceColumnOrder",
    COLUMNS.map((c) => c.key)
  );
  const columnsByKey = new Map(COLUMNS.map((c) => [c.key, c]));
  const orderedColumns = order.map((k) => columnsByKey.get(k)!);

  return (
    <div className={shellCls}>
      <FullscreenExitFab fullscreen={fullscreen} onExit={toggleFullscreen} />
      {!fullscreen && <FiltersBar />}
      <DataTableContainer
        title="Compliance Sheet"
        subtitle="Auto-generated from Master"
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
        <CrmTable>
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
              rows.map((x) => (
                <tr key={x.id}>
                  {orderedColumns.map((col) => (
                    <td key={col.key} className={col.className}>
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
    </div>
  );
}
