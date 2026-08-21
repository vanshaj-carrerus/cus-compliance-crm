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
  fmtDate,
} from "@/lib/crm";

export function Compliance() {
  const { filtered } = useCrm();
  const list = filtered().filter(
    (x) => x.status === "Active" || getRemaining(x) > 0
  );
  const { page, pageSize, pageCount, pageItems, setPage, setPageSize } =
    usePagination(list, 50);
  const { fullscreen, toggleFullscreen, shellCls } = useFullscreen();
  const rows = fullscreen ? list : pageItems;

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
          />
        }
      >
        <CrmTable>
          <thead>
            <tr>
              <th>Assigned</th>
              <th>Candidate</th>
              <th>Floor</th>
              <th>P.O</th>
              <th>Total Fee</th>
              <th>Paid</th>
              <th>Remaining</th>
              <th>Last Pay</th>
              <th>Next Due</th>
              <th>Status</th>
              <th>Remarks</th>
            </tr>
          </thead>
          <tbody>
            {rows.length ? (
              rows.map((x) => (
                <tr key={x.id}>
                  <td>{x.assignedTo}</td>
                  <td>
                    <strong>{x.name}</strong>
                  </td>
                  <td>{x.floor || "-"}</td>
                  <td>{x.po || "-"}</td>
                  <td className="accent-text">{money(x.totalServiceFee)}</td>
                  <td className="success-text">{money(getTotalPaid(x))}</td>
                  <td className="danger-text">{money(getRemaining(x))}</td>
                  <td>{fmtDate(getLastPaymentDate(x))}</td>
                  <td>{fmtDate(getNextDueDate(x))}</td>
                  <td>
                    <Badge label={getComplianceStatus(x)} />
                  </td>
                  <td>
                    <RemarksCell>{x.remarks}</RemarksCell>
                  </td>
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
