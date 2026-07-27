"use client";

import { useCrm } from "../CrmProvider";
import { FiltersBar } from "../FiltersBar";
import {
  CrmTable,
  DataTableContainer,
  EmptyTableRow,
  PaginationBar,
  RemarksCell,
  StatCard,
  usePagination,
} from "../shared";
import {
  money,
  incentiveRows,
  currentCycleStart,
  addDaysDate,
  toIsoDate,
  fmtDate,
} from "@/lib/crm";

export function Incentive() {
  const { settings, updateSettings, filtered } = useCrm();
  const defaultStart = currentCycleStart();
  const defaultEnd = addDaysDate(defaultStart, 31);
  const from = settings.incentiveFrom || toIsoDate(defaultStart);
  const to = settings.incentiveTo || toIsoDate(defaultEnd);
  const start = new Date(from + "T00:00:00");
  const end = new Date(to + "T00:00:00");
  end.setHours(23, 59, 59, 999);

  const rows = incentiveRows(filtered(), start, end);
  const { page, pageSize, pageCount, pageItems, setPage, setPageSize } =
    usePagination(rows, 50);
  const totalPayments = rows.reduce((s, r) => s + r.amount, 0);
  const totalIncentive = rows.reduce((sum, row) => sum + row.incentive, 0);

  const applyRange = (fromVal: string, toVal: string) => {
    updateSettings({ incentiveFrom: fromVal, incentiveTo: toVal });
  };

  return (
    <div>
      <div className="date-range-bar">
        <label>
          From Date
          <input
            type="date"
            value={from}
            onChange={(e) => applyRange(e.target.value, to)}
          />
        </label>
        <label>
          To Date
          <input
            type="date"
            value={to}
            onChange={(e) => applyRange(from, e.target.value)}
          />
        </label>
        <button
          type="button"
          className="btn btn-primary btn-sm"
          onClick={() => applyRange(from, to)}
        >
          Show Report
        </button>
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={() => {
            const s = currentCycleStart();
            const e = addDaysDate(s, 31);
            applyRange(toIsoDate(s), toIsoDate(e));
            updateSettings({ incentiveStart: s.toISOString() });
          }}
        >
          Current 25th Cycle
        </button>
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={() => {
            const n = new Date();
            const s = new Date(n.getFullYear(), n.getMonth(), 1);
            const e = new Date(n.getFullYear(), n.getMonth() + 1, 0);
            applyRange(toIsoDate(s), toIsoDate(e));
          }}
        >
          Current Month
        </button>
      </div>

      <div className="stat-grid">
        <StatCard
          label="Selected Period"
          value={`${fmtDate(from)} → ${fmtDate(to)}`}
          sub={`${rows.length} payment rows`}
        />
        <StatCard
          label="Total Payments"
          value={money(totalPayments)}
          sub="Payments inside selected dates"
          tone="success"
        />
        <StatCard
          label="Yatin Incentive"
          value={money(totalIncentive)}
          sub="Payment ÷ 2"
          tone="info"
        />
      </div>

      <FiltersBar />
      <DataTableContainer
        title="Incentive Sheet"
        subtitle="Filter any From/To dates manually"
        toolbar={
          <PaginationBar
            total={rows.length}
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
              <th>Payment Date</th>
              <th>Amount</th>
              <th>Incentive</th>
              <th>Running Total</th>
              <th>Floor</th>
              <th>Remarks</th>
            </tr>
          </thead>
          <tbody>
            {pageItems.length ? (
              pageItems.map((r, i) => {
                const globalIdx = page * pageSize + i;
                const priorRunning = rows
                  .slice(0, globalIdx)
                  .reduce(
                    (sum, row) =>
                      row.assignedTo === r.assignedTo
                        ? sum + row.incentive
                        : sum,
                    0
                  );
                const runningTotal = priorRunning + r.incentive;
                return (
                  <tr key={`${r.candidateName}-${r.date}-${i}`}>
                    <td>{r.assignedTo}</td>
                    <td>
                      <strong>{r.candidateName}</strong>
                    </td>
                    <td>{fmtDate(r.date)}</td>
                    <td className="success-text">{money(r.amount)}</td>
                    <td className="accent-text">{money(r.incentive)}</td>
                    <td>{money(runningTotal)}</td>
                    <td>{r.floor || "-"}</td>
                    <td>
                      <RemarksCell>{r.notes}</RemarksCell>
                    </td>
                  </tr>
                );
              })
            ) : (
              <EmptyTableRow
                colSpan={8}
                message="No paid installments found in selected date range."
              />
            )}
          </tbody>
        </CrmTable>
      </DataTableContainer>
    </div>
  );
}
