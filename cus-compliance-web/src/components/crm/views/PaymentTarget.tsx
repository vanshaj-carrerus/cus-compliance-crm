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
  fmtDate,
  fmtMonth,
} from "@/lib/crm";

function priorityClass(pri: string) {
  if (pri === "Red") return "danger-text";
  if (pri === "Orange") return "warning-text";
  if (pri === "Yellow") return "muted";
  return "success-text";
}

export function PaymentTarget() {
  const { filtered, settings, updateSettings, updateMasterField } = useCrm();
  const d = new Date(settings.targetMonth);
  const list = filtered().filter((x) => getRemaining(x) > 0);
  const { page, pageSize, pageCount, pageItems, setPage, setPageSize } =
    usePagination(list, 50);

  const shiftMonth = (delta: number) => {
    const next = new Date(d);
    next.setMonth(next.getMonth() + delta);
    updateSettings({ targetMonth: next.toISOString() });
  };
  const { fullscreen, toggleFullscreen, shellCls } = useFullscreen();
  const rows = fullscreen ? list : pageItems;

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
          />
        }
      >
        <CrmTable minWidth="1200px">
          <thead>
            <tr>
              <th>Assigned</th>
              <th>Candidate</th>
              <th>Floor</th>
              <th>P.O</th>
              <th>Installment Due</th>
              <th>Expected Amount</th>
              <th>Expected Date</th>
              <th>Month Remarks</th>
              <th>Paid</th>
              <th>Remaining</th>
              <th>Last Payment</th>
              <th>Next Payment</th>
              <th>Status</th>
              <th>Priority</th>
            </tr>
          </thead>
          <tbody>
            {rows.length ? (
              rows.map((x) => {
                const due = getDueForMonth(x, d);
                const pri = priority(x, d);
                return (
                  <tr key={x.id}>
                    <td>{x.assignedTo}</td>
                    <td>
                      <strong>{x.name}</strong>
                    </td>
                    <td>{x.floor || "-"}</td>
                    <td>{x.po || "-"}</td>
                    <td className="accent-text">{due ? money(due) : "-"}</td>
                    <td>
                      <input
                        className="target-input"
                        value={String(x.expectedAmount ?? "")}
                        placeholder="$ expected"
                        onChange={(e) =>
                          updateMasterField(
                            x.id,
                            "expectedAmount",
                            e.target.value
                          )
                        }
                      />
                    </td>
                    <td>
                      <input
                        type="date"
                        className="target-input date"
                        value={x.expectedDate || ""}
                        onChange={(e) =>
                          updateMasterField(x.id, "expectedDate", e.target.value)
                        }
                      />
                    </td>
                    <td>
                      <input
                        className="target-input remarks"
                        value={x.monthRemarks || ""}
                        placeholder="Monthly remarks"
                        onChange={(e) =>
                          updateMasterField(x.id, "monthRemarks", e.target.value)
                        }
                      />
                    </td>
                    <td className="success-text">{money(getTotalPaid(x))}</td>
                    <td className="danger-text">{money(getRemaining(x))}</td>
                    <td>{fmtDate(getLastPaymentDate(x))}</td>
                    <td>{fmtDate(getNextDueDate(x))}</td>
                    <td>
                      <Badge label={getComplianceStatus(x)} />
                    </td>
                    <td className={priorityClass(pri)}>{pri}</td>
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
