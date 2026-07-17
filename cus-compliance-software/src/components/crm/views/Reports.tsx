"use client";

import { useCrm } from "../CrmProvider";
import { ChartCard, CrmTable, DataTableContainer } from "../shared";
import { money, getTotalPaid, getRemaining } from "@/lib/crm";

export function Reports() {
  const { candidates } = useCrm();
  const floor: Record<
    string,
    { count: number; fee: number; paid: number; rem: number }
  > = {};

  candidates.forEach((x) => {
    const f = x.floor || "Unknown";
    if (!floor[f]) floor[f] = { count: 0, fee: 0, paid: 0, rem: 0 };
    floor[f].count++;
    floor[f].fee += x.totalServiceFee;
    floor[f].paid += getTotalPaid(x);
    floor[f].rem += getRemaining(x);
  });

  const entries = Object.entries(floor).sort((a, b) => b[1].fee - a[1].fee);
  const totals = entries.reduce(
    (acc, [, s]) => {
      acc.count += s.count;
      acc.fee += s.fee;
      acc.paid += s.paid;
      acc.rem += s.rem;
      return acc;
    },
    { count: 0, fee: 0, paid: 0, rem: 0 }
  );

  return (
    <div>
      <ChartCard
        title="Collection Overview"
        subtitle="Floor-wise breakdown of fees, collections, and outstanding balance"
      >
        <div className="stat-grid">
          <div className="stat-card">
            <div className="stat-label">Candidates</div>
            <div className="stat-value">{totals.count}</div>
          </div>
          <div className="stat-card info">
            <div className="stat-label">Total Fee</div>
            <div className="stat-value">{money(totals.fee)}</div>
          </div>
          <div className="stat-card success">
            <div className="stat-label">Collected</div>
            <div className="stat-value">{money(totals.paid)}</div>
          </div>
          <div className="stat-card danger">
            <div className="stat-label">Remaining</div>
            <div className="stat-value">{money(totals.rem)}</div>
          </div>
        </div>
      </ChartCard>

      <DataTableContainer
        title="Floor-wise Collection"
        subtitle={`${entries.length} floors`}
      >
        <CrmTable minWidth="720px">
          <thead>
            <tr>
              <th>Floor</th>
              <th>Candidates</th>
              <th>Total Fee</th>
              <th>Collected</th>
              <th>Remaining</th>
              <th>Collection %</th>
            </tr>
          </thead>
          <tbody>
            {entries.map(([f, s]) => {
              const pct = s.fee ? Math.round((s.paid / s.fee) * 100) : 0;
              return (
                <tr key={f}>
                  <td>
                    <strong>{f}</strong>
                  </td>
                  <td>{s.count}</td>
                  <td className="accent-text">{money(s.fee)}</td>
                  <td className="success-text">{money(s.paid)}</td>
                  <td className="danger-text">{money(s.rem)}</td>
                  <td>{pct}%</td>
                </tr>
              );
            })}
          </tbody>
        </CrmTable>
      </DataTableContainer>
    </div>
  );
}
