"use client";

import { useCrm } from "../CrmProvider";
import { EmptyDataNotice } from "../DataStates";
import {
  Badge,
  ColumnResizeHandle,
  FullscreenButton,
  FullscreenExitFab,
  PasteProgressOverlay,
  SheetCaptureField,
  ResetColumnsButton,
  TableShell,
  useColumnOrder,
  useColumnWidths,
  useFullscreen,
  useSheetGrid,
  syncField,
  type SheetColumn,
  PhoneInput,
} from "../shared";
import {
  money,
  getTotalPaid,
  getRemaining,
  applyPaidAmount,
  fmtDate,
  filteredDaily,
  rowColorClass,
  phoneOf,
  cleanPhone,
  normalizeCandidate,
  newId,
} from "@/lib/crm";
import type { Candidate } from "@/lib/crm/types";

// With table-layout:fixed a column that has no explicit width collapses to
// ~0px, which stacks its content vertically and balloons the row height.
// Every <th> in this table must therefore carry a width.
const FIXED_COL = (w: number): React.CSSProperties => ({
  width: w,
  minWidth: w,
  maxWidth: w,
});

type DailyRow = ReturnType<typeof filteredDaily>[number];

export function DailyFollowUp({
  onWhatsApp,
}: {
  onWhatsApp: (id: number | number[], template?: string) => void;
}) {
  const {
    candidates,
    setCandidates,
    queueSave,
    cellSync,
    snapshot,
    toast,
    dailyCategory,
    setDailyCategory,
    dailyFilters,
    setDailyFilters,
    dailySelected,
    setDailySelected,
    markContacted,
    updateContactField,
    updateMasterField,
    setPaidAmount,
    navigate,
    assignableUsers,
  } = useCrm();

  // One list: everyone with an amount left to pay. (The two "Follow-ups"
  // buttons below still switch to the follow-up-date lists.)
  const category =
    dailyCategory === "followupsToday" || dailyCategory === "followupsOverdue"
      ? dailyCategory
      : "all";
  const isBalanceList = category === "all";
  const title =
    category === "followupsToday"
      ? "Follow-ups Due Today"
      : category === "followupsOverdue"
        ? "Overdue Follow-ups"
        : "Follow-ups - Payment Left to Pay";

  const rows = filteredDaily(candidates, category, dailyFilters);
  const totalLeft = rows.reduce((s, r) => s + (isBalanceList ? r.amount : 0), 0);

  const assignees = [
    ...new Set([
      ...assignableUsers,
      ...candidates.map((c) => c.assignedTo).filter(Boolean),
    ]),
  ].sort();
  const poMonths = [
    ...new Set(candidates.map((c) => c.poMonth).filter(Boolean)),
  ].sort();
  const statuses = [
    ...new Set(candidates.map((c) => c.status).filter(Boolean)),
  ];

  const toggleAll = (checked: boolean) => {
    const next = new Set(dailySelected);
    rows.forEach((r) => {
      const id = String(r.candidate.id);
      if (checked) next.add(id);
      else next.delete(id);
    });
    setDailySelected(next);
  };

  const toggleOne = (id: string, checked: boolean) => {
    const next = new Set(dailySelected);
    if (checked) next.add(id);
    else next.delete(id);
    setDailySelected(next);
  };

  const { fullscreen, toggleFullscreen, shellCls } = useFullscreen();

  const columns: {
    key: string;
    label: string;
    className?: string | ((r: DailyRow) => string);
    render: (r: DailyRow) => React.ReactNode;
  }[] = [
    {
      key: "candidate",
      label: "Candidate",
      render: (r) => (
        <>
          <input
            className="sheet-cell name-priority"
            defaultValue={r.candidate.name || ""}
            key={r.candidate.id + "-name-" + (r.candidate.name || "")}
            onBlur={(e) =>
              e.target.value !== (r.candidate.name || "") &&
              updateMasterField(r.candidate.id, "name", e.target.value)
            }
          />
          <div className="mt-1 md:hidden">
            <Badge label={r.candidate.status || "Unset"} />
          </div>
        </>
      ),
    },
    {
      key: "phone",
      label: "Phone",
      render: (r) => (
        <PhoneInput
          value={phoneOf(r.candidate) || ""}
          onCommit={(v) => updateMasterField(r.candidate.id, "phoneNumber", v)}
        />
      ),
    },
    {
      key: "poMonth",
      label: "P.O Month",
      render: (r) => (
        <input
          className="sheet-cell"
          defaultValue={r.candidate.poMonth || ""}
          key={r.candidate.id + "-poMonth-" + (r.candidate.poMonth || "")}
          onBlur={(e) =>
            e.target.value !== (r.candidate.poMonth || "") &&
            updateMasterField(r.candidate.id, "poMonth", e.target.value)
          }
        />
      ),
    },
    {
      key: "assigned",
      label: "Assigned",
      render: (r) => (
        <select
          className="sheet-cell"
          value={r.candidate.assignedTo || ""}
          onChange={(e) =>
            updateMasterField(r.candidate.id, "assignedTo", e.target.value)
          }
        >
          <option value="">-</option>
          {[
            ...new Set(
              r.candidate.assignedTo
                ? [...assignableUsers, r.candidate.assignedTo]
                : assignableUsers
            ),
          ].map((name) => (
            <option key={name}>{name}</option>
          ))}
        </select>
      ),
    },
    {
      key: "totalFee",
      label: "Total Fee",
      render: (r) => (
        <input
          className="sheet-cell"
          defaultValue={r.candidate.totalServiceFee ? String(r.candidate.totalServiceFee) : ""}
          key={r.candidate.id + "-totalFee-" + (r.candidate.totalServiceFee || "")}
          onBlur={(e) => {
            const c = r.candidate;
            if (e.target.value === (c.totalServiceFee ? String(c.totalServiceFee) : "")) return;
            updateMasterField(c.id, "totalServiceFee", e.target.value);
          }}
        />
      ),
    },
    {
      key: "paidAmount",
      label: "Paid",
      className: "text-success",
      render: (r) => (
        <input
          className="sheet-cell text-success"
          defaultValue={String(getTotalPaid(r.candidate))}
          key={r.candidate.id + "-paid-" + getTotalPaid(r.candidate)}
          title="Editing this marks/unmarks installments (earliest first) until their paid sum matches what you type"
          onBlur={(e) => {
            const parsed = Number(String(e.target.value).replace(/[$,%\s,]/g, "")) || 0;
            if (parsed === getTotalPaid(r.candidate)) return;
            setPaidAmount(r.candidate.id, parsed);
          }}
        />
      ),
    },
    {
      key: "remaining",
      label: "Remaining",
      className: "text-danger",
      render: (r) => (
        <input
          className="sheet-cell text-danger"
          defaultValue={String(getRemaining(r.candidate))}
          key={r.candidate.id + "-remaining-" + getRemaining(r.candidate)}
          title="Editing this backs into a new Total Fee (Total = Paid + what you type here)"
          onBlur={(e) => {
            const c = r.candidate;
            const parsed = Number(String(e.target.value).replace(/[$,%\s,]/g, "")) || 0;
            if (parsed === getRemaining(c)) return;
            updateMasterField(c.id, "totalServiceFee", String(getTotalPaid(c) + parsed));
          }}
        />
      ),
    },
    {
      key: "dueAmount",
      label: isBalanceList ? "Amount Left" : "Due Amount",
      className: "text-primary",
      render: (r) => money(r.amount),
    },
    {
      key: "dueDate",
      label: isBalanceList ? "Next Pay Date" : "Due Date",
      render: (r) => (r.date ? fmtDate(r.date) : "-"),
    },
    {
      key: "daysOverdue",
      label: "Days Overdue",
      className: (r) => (r.days ? "font-bold text-danger" : "text-muted"),
      render: (r) => r.days || "-",
    },
    {
      key: "lastContact",
      label: "Last Contact",
      render: (r) => (
        <input
          type="date"
          className="rounded border border-border bg-input px-1 py-0.5 text-xs sheet-cell"
          value={r.candidate.lastContactDate || ""}
          onChange={(e) =>
            updateContactField(r.candidate.id, "lastContactDate", e.target.value)
          }
        />
      ),
    },
  ];
  const { order, gripProps, headerProps, resetOrder } = useColumnOrder(
    "dailyFollowUpColumnOrder",
    columns.map((c) => c.key)
  );
  const { colStyle, resizeHandleProps, resetWidths } = useColumnWidths(
    "dailyFollowUpColumnWidths",
    columns.map((c) => c.key),
    { candidate: 180, default: 130 }
  );
  const columnsByKey = new Map(columns.map((c) => [c.key, c]));
  const orderedColumns = order.map((k) => columnsByKey.get(k)!);

  // Same select/copy/paste workflow as Master P.O Sheet (see useSheetGrid).
  // A DailyRow is a projection of one candidate's next-due installment, not
  // a standalone record, so selection/copy operates on the underlying
  // candidates (`gridRows`) while getText still reads the DailyRow-specific
  // fields (amount/date/days) via this lookup.
  const dailyRowByCandidateId = new Map(rows.map((r) => [r.candidate.id, r]));
  const gridRows = rows.map((r) => r.candidate);
  const sheetColumns: SheetColumn<Candidate>[] = [
    {
      key: "candidate",
      editable: true,
      getText: (x) => x.name || "",
      applyText: (x, v) => {
        x.name = v;
      },
    },
    {
      key: "phone",
      editable: true,
      getText: (x) => phoneOf(x) || "",
      applyText: (x, v) => {
        x.phoneNumber = v;
      },
    },
    {
      key: "poMonth",
      editable: true,
      getText: (x) => x.poMonth || "",
      applyText: (x, v) => {
        x.poMonth = v;
      },
    },
    {
      key: "assigned",
      editable: true,
      getText: (x) => x.assignedTo || "",
      applyText: (x, v) => {
        x.assignedTo = v;
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
      key: "paidAmount",
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
    {
      key: "dueAmount",
      editable: false,
      getText: (x) => money(dailyRowByCandidateId.get(x.id)?.amount || 0),
    },
    {
      key: "dueDate",
      editable: false,
      getText: (x) => fmtDate(dailyRowByCandidateId.get(x.id)?.date || ""),
    },
    {
      key: "daysOverdue",
      editable: false,
      getText: (x) => String(dailyRowByCandidateId.get(x.id)?.days || ""),
    },
    {
      key: "lastContact",
      editable: true,
      getText: (x) => x.lastContactDate || "",
      applyText: (x, v) => {
        x.lastContactDate = v;
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
      rows: gridRows,
      columns: orderedSheetColumns,
      allRows: candidates,
      setAllRows: setCandidates,
      queueSave,
      snapshot,
      toast,
      createBlankRow: () => normalizeCandidate({ id: newId() }),
      normalize: normalizeCandidate,
      overflowNote:
        "New candidates only show up here once they have Name/P.O/Month and a matching due installment set on Master P.O Sheet.",
    });

  return (
    <div className={shellCls}>
      {!fullscreen && (
      <>
      <div className="mb-4 grid grid-cols-1 gap-3 rounded-[17px] border border-border bg-card p-3 sm:grid-cols-2 sm:items-end lg:flex lg:flex-wrap">
        <div className="mr-auto min-w-0 sm:col-span-2 lg:col-span-1">
          <div className="text-base font-semibold">Daily Follow-up Queue</div>
          <div className="text-xs text-muted">
            Payments and follow-up commitments in one execution view
          </div>
        </div>
        <label className="flex min-w-0 flex-col gap-1 text-xs text-muted">
          Assigned
          <select
            className="w-full rounded border border-border bg-input px-2 py-1.5 text-sm"
            value={dailyFilters.assignedTo || ""}
            onChange={(e) =>
              setDailyFilters({ ...dailyFilters, assignedTo: e.target.value })
            }
          >
            <option value="">All</option>
            {assignees.map((v) => (
              <option key={v}>{v}</option>
            ))}
          </select>
        </label>
        <label className="flex min-w-0 flex-col gap-1 text-xs text-muted">
          P.O Month
          <select
            className="w-full rounded border border-border bg-input px-2 py-1.5 text-sm"
            value={dailyFilters.poMonth || ""}
            onChange={(e) =>
              setDailyFilters({ ...dailyFilters, poMonth: e.target.value })
            }
          >
            <option value="">All</option>
            {poMonths.map((v) => (
              <option key={v}>{v}</option>
            ))}
          </select>
        </label>
        <label className="flex min-w-0 flex-col gap-1 text-xs text-muted">
          Status
          <select
            className="w-full rounded border border-border bg-input px-2 py-1.5 text-sm"
            value={dailyFilters.status || ""}
            onChange={(e) =>
              setDailyFilters({ ...dailyFilters, status: e.target.value })
            }
          >
            <option value="">All</option>
            {statuses.map((v) => (
              <option key={v}>{v}</option>
            ))}
          </select>
        </label>
        <button
          type="button"
          className={`w-full rounded border px-3 py-2 text-xs font-medium sm:w-auto ${
            isBalanceList
              ? "border-primary bg-primary/10 text-primary"
              : "border-border bg-secondary"
          }`}
          onClick={() => {
            setDailyCategory("all");
            setDailySelected(new Set());
          }}
        >
          All Pending Payments
        </button>
        <button
          type="button"
          className="w-full rounded border border-border bg-secondary px-3 py-2 text-xs font-medium sm:w-auto"
          onClick={() => {
            setDailyCategory("followupsToday");
            setDailySelected(new Set());
          }}
        >
          Today Follow-ups
        </button>
        <button
          type="button"
          className="w-full rounded border border-border bg-secondary px-3 py-2 text-xs font-medium sm:w-auto"
          onClick={() => {
            setDailyCategory("followupsOverdue");
            setDailySelected(new Set());
          }}
        >
          Overdue Follow-ups
        </button>
        <button
          type="button"
          disabled={dailySelected.size === 0}
          className="w-full rounded bg-success px-3 py-2 text-xs font-medium text-white disabled:opacity-50 sm:w-auto"
          onClick={() => {
            onWhatsApp(
              [...dailySelected].map(Number),
              "Payment Reminder"
            );
          }}
        >
          💬 Bulk Reminder ({dailySelected.size})
        </button>
      </div>
      </>
      )}

      <FullscreenExitFab fullscreen={fullscreen} onExit={toggleFullscreen} />
      <TableShell
        title={title}
        subtitle={
          isBalanceList
            ? `${rows.length} candidates with a balance · ${money(totalLeft)} left to collect`
            : `${rows.length} candidates prioritized by due date`
        }
        fullscreen={fullscreen}
        scrollRef={scrollRef}
        onPaste={handlePaste}
        actions={
          <FullscreenButton fullscreen={fullscreen} onToggle={toggleFullscreen} />
        }
      >
        {!fullscreen && (
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-border bg-secondary px-2.5 py-1 text-xs text-muted">
              {rows.length} rows
            </span>
            <ResetColumnsButton
              onReset={() => {
                resetOrder();
                resetWidths();
              }}
            />
          </div>
        )}
        <table className="data-table data-table-resizable sheet-selectable w-full min-w-275 text-sm">
          <thead>
            <tr>
              <th style={FIXED_COL(44)}>
                <input
                  type="checkbox"
                  onChange={(e) => toggleAll(e.target.checked)}
                />
              </th>
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
              <th style={FIXED_COL(250)}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, rowIdx) => {
              const c = r.candidate;
              const id = String(c.id);
              return (
                <tr key={id} className={rowColorClass(c)}>
                  <td>
                    <input
                      type="checkbox"
                      checked={dailySelected.has(id)}
                      onChange={(e) => toggleOne(id, e.target.checked)}
                    />
                  </td>
                  {orderedColumns.map((col, colIdx) => {
                    const cls =
                      typeof col.className === "function"
                        ? col.className(r)
                        : col.className;
                    return (
                      <td
                        key={col.key}
                        {...cellProps(rowIdx, colIdx)}
                        data-sync={cellSync(c.id, syncField(col.key))}
                        data-cid={c.id}
                        data-field={syncField(col.key)}
                        className={`${cls || ""} ${isCellSelected(rowIdx, colIdx) ? "cell-selected" : ""}`}
                      >
                        {col.render(r)}
                      </td>
                    );
                  })}
                  <td>
                    <div className="flex flex-wrap gap-1">
                      <button
                        type="button"
                        className="rounded bg-success px-2 py-1 text-xs text-white"
                        onClick={() => markContacted(c.id)}
                      >
                        ✓ Contacted
                      </button>
                      <button
                        type="button"
                        className="rounded bg-secondary px-2 py-1 text-xs"
                        onClick={() =>
                          onWhatsApp(
                            c.id,
                            dailyCategory === "overdue"
                              ? "Payment Overdue"
                              : "Payment Reminder"
                          )
                        }
                      >
                        💬
                      </button>
                      <a
                        className="rounded border border-border bg-secondary px-2 py-1 text-xs"
                        href={`tel:${cleanPhone(phoneOf(c))}`}
                      >
                        📞
                      </a>
                      <button
                        type="button"
                        className="rounded border border-border bg-secondary px-2 py-1 text-xs"
                        onClick={() => navigate("master")}
                      >
                        Master
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!rows.length && (
          <EmptyDataNotice message="No candidates with a payment left to collect." />
        )}
      </TableShell>
      <SheetCaptureField {...captureProps} />
      <PasteProgressOverlay pasteProgress={pasteProgress} />
    </div>
  );
}
