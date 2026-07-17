"use client";

import { useCrm } from "../CrmProvider";
import {
  Badge,
  CrmTable,
  DataTableContainer,
  EmptyTableRow,
  PaginationBar,
  RemarksCell,
  usePagination,
} from "../shared";
import { money, fmtDate, phoneOf } from "@/lib/crm";

export function History() {
  const { history, candidates } = useCrm();
  const rows = [...history].sort(
    (a, b) =>
      new Date(b.timestamp || b.date).getTime() -
      new Date(a.timestamp || a.date).getTime()
  );
  const { page, pageSize, pageCount, pageItems, setPage, setPageSize } =
    usePagination(rows, 50);

  const messages = candidates
    .flatMap((c) =>
      (c.messageLog || []).map((m) => ({
        ...m,
        candidateName: c.name,
        phone: phoneOf(c),
      }))
    )
    .sort((a, b) => String(b.timestamp).localeCompare(String(a.timestamp)));

  return (
    <div className="space-y-4">
      <DataTableContainer
        title="Payment History Ledger"
        subtitle={`${rows.length} records`}
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
              <th>Date</th>
              <th>Assigned</th>
              <th>Candidate</th>
              <th>Amount</th>
              <th>Type</th>
              <th>Notes</th>
              <th>Timestamp</th>
            </tr>
          </thead>
          <tbody>
            {pageItems.length ? (
              pageItems.map((h) => (
                <tr key={h.id}>
                  <td>{fmtDate(h.date)}</td>
                  <td>{h.assignedTo || "-"}</td>
                  <td>
                    <strong>{h.candidateName}</strong>
                  </td>
                  <td className="success-text">{money(h.amount)}</td>
                  <td>
                    <Badge label={h.type || "Payment"} />
                  </td>
                  <td>
                    <RemarksCell>{h.notes}</RemarksCell>
                  </td>
                  <td className="muted">
                    {new Date(h.timestamp || h.date).toLocaleString()}
                  </td>
                </tr>
              ))
            ) : (
              <EmptyTableRow colSpan={7} message="No payment history yet." />
            )}
          </tbody>
        </CrmTable>
      </DataTableContainer>

      {messages.length > 0 && (
        <DataTableContainer
          title="WhatsApp Message Log"
          subtitle={`${messages.length} messages`}
        >
          <CrmTable>
            <thead>
              <tr>
                <th>Date / Time</th>
                <th>Candidate</th>
                <th>Phone</th>
                <th>Template</th>
                <th>Message</th>
              </tr>
            </thead>
            <tbody>
              {messages.map((m) => (
                <tr key={m.id}>
                  <td className="muted">
                    {new Date(m.timestamp).toLocaleString()}
                  </td>
                  <td>
                    <strong>{m.candidateName}</strong>
                  </td>
                  <td>{m.phone || "-"}</td>
                  <td>{m.template || "Custom"}</td>
                  <td>
                    <RemarksCell>{m.message}</RemarksCell>
                  </td>
                </tr>
              ))}
            </tbody>
          </CrmTable>
        </DataTableContainer>
      )}
    </div>
  );
}
