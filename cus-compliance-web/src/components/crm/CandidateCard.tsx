"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { assigneeOptions, assigneeValue } from "@/lib/assignees";
import {
  closeCandidateCard,
  getCandidateCardId,
  getServerCandidateCardId,
  subscribeCandidateCard,
} from "@/lib/candidate-card";
import { requestCandidateFocus } from "@/lib/search-focus";
import {
  fmtDate,
  getComplianceStatus,
  getLastPaymentDate,
  getNextDueDate,
  getRemaining,
  getTotalPaid,
  money,
  phoneOf,
} from "@/lib/crm";
import type { Candidate } from "@/lib/crm/types";
import { useCrm } from "./CrmProvider";

const TABS = ["Overview", "Payments", "Compliance", "Notes"] as const;
type Tab = (typeof TABS)[number];

// The card has its own fixed light "frosted glass" palette so it looks the
// same in every app theme.
const INK = "#1b1f4b";
const SOFT = "#5b628f";
const BLUE_GRAD = "linear-gradient(135deg,#2f7cf6,#4f94ff)";

const ICONS = {
  briefcase: ["M16 20V4a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16", "M4 6h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2z"],
  percent: ["M19 5 5 19", "M6.5 9a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z", "M17.5 20a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z"],
  doc: ["M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z", "M14 2v6h6", "M9 13h6", "M9 17h6"],
  wallet: ["M20 7H5a2 2 0 0 1 0-4h13v4", "M3 5v14a2 2 0 0 0 2 2h15V7", "M16 14h.01"],
  calendar: ["M8 2v4", "M16 2v4", "M3 9h18", "M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z"],
  shield: ["M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z", "m9 12 2 2 4-4"],
  user: ["M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2", "M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z"],
  users: ["M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2", "M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z", "M22 21v-2a4 4 0 0 0-3-3.87", "M16 3.13a4 4 0 0 1 0 7.75"],
  phone: ["M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z"],
  chat: ["M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"],
  mail: ["M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z", "m22 6-10 7L2 6"],
  more: ["M5 12h.01", "M12 12h.01", "M19 12h.01"],
  pencil: ["M17 3a2.83 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5z"],
  arrow: ["M5 12h14", "m12 5 7 7-7 7"],
  chevron: ["m6 9 6 6 6-6"],
  check: ["M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z", "m9 12 2 2 4-4"],
  x: ["M18 6 6 18", "m6 6 12 12"],
} as const;

function Icon({
  name,
  size = 16,
  stroke = 2,
  className,
}: {
  name: keyof typeof ICONS;
  size?: number;
  stroke?: number;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={stroke}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      {ICONS[name].map((d, i) => (
        <path key={i} d={d} />
      ))}
    </svg>
  );
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}

const glassCard =
  "rounded-2xl border border-white/70 bg-white/75 shadow-[0_6px_18px_-10px_rgba(70,80,170,0.35)]";

/** One labelled line inside a card. `tone` tints the little icon tile. */
function Line({
  icon,
  tone = SOFT,
  label,
  children,
  divider = true,
}: {
  icon?: keyof typeof ICONS;
  tone?: string;
  label: string;
  children: React.ReactNode;
  divider?: boolean;
}) {
  return (
    <div
      className={`flex items-center justify-between gap-3 px-3.5 py-2.5 text-[13px] ${
        divider ? "border-b border-[#6a72c8]/10 last:border-b-0" : ""
      }`}
    >
      <span className="flex min-w-0 items-center gap-2.5 font-medium" style={{ color: INK }}>
        {icon && (
          <span
            className="flex size-6 shrink-0 items-center justify-center rounded-md"
            style={{ color: tone, background: `${tone}1f` }}
          >
            <Icon name={icon} size={14} />
          </span>
        )}
        <span className="truncate">{label}</span>
      </span>
      <span className="min-w-0 truncate text-right font-bold" style={{ color: INK }}>
        {children}
      </span>
    </div>
  );
}

function complianceTone(s: string) {
  if (s === "Completed" || s === "On Track") return { bg: "#d9f5e5", fg: "#17804f" };
  if (s === "Overdue") return { bg: "#fde0e3", fg: "#c2303f" };
  if (s === "Due Soon") return { bg: "#fdf0d0", fg: "#a56a05" };
  return { bg: "#e1e8ff", fg: "#3558c9" };
}

function statusDot(s: string) {
  const v = s.toLowerCase();
  if (!v || v.includes("active")) return "#22b573";
  if (v.includes("cancel") || v.includes("no response") || v.includes("default")) return "#e04a5a";
  return "#f0a020";
}

export function CandidateCard() {
  const id = useSyncExternalStore(
    subscribeCandidateCard,
    getCandidateCardId,
    getServerCandidateCardId
  );
  const { candidates, assignableUsers, updateMasterField, editCandidate, navigate, toast } =
    useCrm();
  const [tab, setTab] = useState<Tab>("Overview");
  const [menuOpen, setMenuOpen] = useState(false);
  const c: Candidate | undefined = id == null ? undefined : candidates.find((x) => x.id === id);

  // Back to Overview whenever a different candidate is opened.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTab("Overview");
    setMenuOpen(false);
  }, [id]);

  // Esc closes the card. Capture phase + stopImmediatePropagation so the same
  // keypress doesn't also leave fullscreen on the sheet underneath.
  useEffect(() => {
    if (id == null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (document.querySelector("[data-modal-overlay]")) return;
      e.stopImmediatePropagation();
      closeCandidateCard();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [id]);

  // Candidate deleted while the card is open.
  useEffect(() => {
    if (id != null && !c) closeCandidateCard();
  }, [id, c]);

  if (!c) return null;

  const total = Number(c.totalServiceFee) || 0;
  const paid = getTotalPaid(c);
  const remaining = getRemaining(c);
  const filled = c.installments.filter((i) => Number(i.amount) > 0);
  const paidCount = filled.filter((i) => i.paid).length;
  const pct = filled.length
    ? Math.round((paidCount / filled.length) * 100)
    : total > 0
      ? Math.min(100, Math.round((paid / total) * 100))
      : 0;
  const next = getNextDueDate(c);
  const lastPay = getLastPaymentDate(c);
  const compliance = getComplianceStatus(c);
  const tone = complianceTone(compliance);
  const phone = phoneOf(c);
  const waDigits = phone.replace(/\D/g, "");

  const copy = (text: string, what: string) => {
    setMenuOpen(false);
    if (!text) {
      toast(`No ${what} to copy`, "info");
      return;
    }
    navigator.clipboard.writeText(text).then(
      () => toast(`${what[0].toUpperCase()}${what.slice(1)} copied`, "success"),
      () => toast("Copy failed - clipboard permission blocked", "error")
    );
  };

  const circleBtn =
    "flex size-10 items-center justify-center rounded-full shadow-sm transition-transform hover:scale-105";

  return (
    <aside
      data-candidate-card
      aria-label="Candidate quick view"
      className="fixed bottom-3 right-3 top-3 z-3900 flex w-[min(340px,calc(100vw-24px))] flex-col overflow-hidden rounded-[28px] border border-white/70 shadow-[0_30px_70px_-20px_rgba(60,70,160,0.55)] backdrop-blur-2xl"
      style={{
        color: INK,
        colorScheme: "light",
        background:
          "linear-gradient(160deg,rgba(238,234,255,0.93) 0%,rgba(214,226,255,0.92) 48%,rgba(230,216,255,0.93) 100%)",
        animation: "hs-in 0.18s ease-out",
      }}
    >
      {/* header */}
      <div className="flex items-center gap-3 px-5 pb-2 pt-5">
        <div
          className="flex size-[52px] shrink-0 items-center justify-center rounded-full border border-white/80 text-lg font-bold shadow-md"
          style={{
            color: "#2b2f6b",
            background: "linear-gradient(145deg,#f1ecff,#cfdcff)",
          }}
        >
          {initials(c.name)}
        </div>
        <div className="min-w-0 flex-1 pr-5">
          <div className="truncate text-[17px] font-extrabold leading-tight">
            {c.name || "Unnamed"}
          </div>
          <div className="truncate text-xs font-medium" style={{ color: SOFT }}>
            P.O: {c.po || "-"}
          </div>
        </div>
        <button
          type="button"
          aria-label="Close"
          onClick={closeCandidateCard}
          className="absolute right-3.5 top-3.5 flex size-6 items-center justify-center rounded-full hover:bg-white/60"
          style={{ color: SOFT }}
        >
          <Icon name="x" size={14} stroke={2.4} />
        </button>
      </div>

      {/* quick actions */}
      <div className="relative flex justify-center gap-3.5 px-5 pb-3 pt-1">
        {phone ? (
          <a
            href={`tel:${phone}`}
            title="Call"
            aria-label="Call"
            className={circleBtn}
            style={{ background: "#d6f5e3", color: "#1b9a5c" }}
          >
            <Icon name="phone" size={17} />
          </a>
        ) : (
          <span
            title="No phone on file"
            className={`${circleBtn} opacity-45`}
            style={{ background: "#d6f5e3", color: "#1b9a5c" }}
          >
            <Icon name="phone" size={17} />
          </span>
        )}
        {waDigits ? (
          <a
            href={`https://wa.me/${waDigits}`}
            target="_blank"
            rel="noreferrer"
            title="WhatsApp"
            aria-label="WhatsApp"
            className={circleBtn}
            style={{ background: "#d9e6ff", color: "#2f6fe0" }}
          >
            <Icon name="chat" size={17} />
          </a>
        ) : (
          <span
            title="No phone on file"
            className={`${circleBtn} opacity-45`}
            style={{ background: "#d9e6ff", color: "#2f6fe0" }}
          >
            <Icon name="chat" size={17} />
          </span>
        )}
        <span
          title="No email on file"
          className={`${circleBtn} opacity-45`}
          style={{ background: "#ecdcff", color: "#8a3fd6" }}
        >
          <Icon name="mail" size={17} />
        </span>
        <button
          type="button"
          title="More"
          aria-label="More"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((v) => !v)}
          className={circleBtn}
          style={{ background: "#ffffffcc", color: SOFT }}
        >
          <Icon name="more" size={18} stroke={3} />
        </button>
        {menuOpen && (
          <div
            className="absolute right-5 top-14 z-10 w-40 overflow-hidden rounded-xl border border-white/80 bg-white/95 py-1 text-[13px] font-semibold shadow-xl"
            style={{ color: INK }}
          >
            <button
              type="button"
              className="block w-full px-3.5 py-2 text-left hover:bg-[#eef1ff]"
              onClick={() => copy(c.name, "name")}
            >
              Copy name
            </button>
            <button
              type="button"
              className="block w-full px-3.5 py-2 text-left hover:bg-[#eef1ff]"
              onClick={() => copy(phone, "phone number")}
            >
              Copy phone
            </button>
          </div>
        )}
      </div>

      {/* tabs */}
      <div className="mx-5 mb-3 flex rounded-full border border-white/70 bg-white/55 p-1 text-xs font-semibold">
        {TABS.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className="flex-1 rounded-full px-1 py-1.5 transition-colors"
            style={
              tab === t
                ? { background: BLUE_GRAD, color: "#fff", boxShadow: "0 4px 10px -3px rgba(47,124,246,.6)" }
                : { color: INK }
            }
          >
            {t}
          </button>
        ))}
      </div>

      {/* body */}
      <div className="flex-1 space-y-2.5 overflow-y-auto px-5 pb-3">
        {tab === "Overview" && (
          <>
            <div className={glassCard}>
              <Line icon="briefcase" label="Offer Amount">
                {money(Number(c.annualPackage) || 0)}
              </Line>
              <Line icon="percent" label="% Service Fee">
                {c.serviceFeePercent ? `${c.serviceFeePercent}%` : "-"}
              </Line>
              <Line icon="doc" label="Total Service Fee">
                {money(total)}
              </Line>
              <Line icon="wallet" tone="#17996a" label="Paid Amount">
                <span style={{ color: "#17996a" }}>{money(paid)}</span>
              </Line>
              <Line icon="wallet" tone="#e04a5a" label="Remaining Amount">
                <span style={{ color: remaining > 0 ? "#e04a5a" : "#17996a" }}>
                  {money(remaining)}
                </span>
              </Line>
            </div>

            <div className={`${glassCard} px-3.5 py-3`}>
              <div className="mb-2 flex items-center justify-between text-[13px]">
                <span className="font-bold">Payment Progress</span>
                <span className="font-bold">
                  {pct}%
                  {filled.length ? (
                    <span className="font-medium" style={{ color: SOFT }}>
                      {" "}
                      ({paidCount} of {filled.length})
                    </span>
                  ) : null}
                </span>
              </div>
              <div className="h-2.5 overflow-hidden rounded-full bg-[#dfe4f5]">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${pct}%`,
                    background: "linear-gradient(90deg,#1faa63,#3fcf86)",
                  }}
                />
              </div>
            </div>

            <div className={glassCard}>
              <Line icon="calendar" label="Next Follow-Up" divider={false}>
                <span
                  className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs"
                  style={{ background: "#dfe9ff", color: "#2456c8" }}
                >
                  <Icon name="calendar" size={13} />
                  {c.nextFollowUpDate ? fmtDate(c.nextFollowUpDate) : "Not set"}
                </span>
              </Line>
            </div>

            <div className={glassCard}>
              <Line icon="shield" label="Compliance Status" divider={false}>
                <span
                  className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs"
                  style={{ background: tone.bg, color: tone.fg }}
                >
                  <Icon name="check" size={13} />
                  {compliance}
                </span>
              </Line>
            </div>

            <div className={glassCard}>
              <Line icon="user" label="Status" divider={false}>
                <span className="inline-flex items-center gap-2">
                  <span
                    className="size-2 rounded-full"
                    style={{ background: statusDot(c.status || "") }}
                  />
                  {c.status || "Active"}
                </span>
              </Line>
            </div>

            <div className={glassCard}>
              <Line icon="users" label="Assigned To" divider={false}>
                <span className="relative inline-flex items-center">
                  <Icon
                    name="user"
                    size={13}
                    className="pointer-events-none absolute left-2.5"
                  />
                  <select
                    aria-label="Assigned to"
                    className="cc-select max-w-37.5 cursor-pointer appearance-none rounded-lg border border-[#6a72c8]/20 bg-white py-1 pl-7 pr-7 text-xs font-bold outline-none"
                    style={{ color: INK }}
                    value={assigneeValue(assignableUsers, c.assignedTo)}
                    onChange={(e) => updateMasterField(c.id, "assignedTo", e.target.value)}
                  >
                    <option value="">-</option>
                    {assigneeOptions(assignableUsers, c.assignedTo).map((n) => (
                      <option key={n}>{n}</option>
                    ))}
                  </select>
                  <Icon
                    name="chevron"
                    size={13}
                    className="pointer-events-none absolute right-2"
                  />
                </span>
              </Line>
            </div>
          </>
        )}

        {tab === "Payments" &&
          (filled.length ? (
            <div className={glassCard}>
              {filled.map((i, k) => (
                <Line
                  key={k}
                  icon="wallet"
                  tone={i.paid ? "#17996a" : SOFT}
                  label={`#${k + 1} · ${i.date ? fmtDate(i.date) : "No date"}`}
                >
                  {money(Number(i.amount) || 0)}{" "}
                  <span style={{ color: i.paid ? "#17996a" : SOFT }} className="text-xs">
                    {i.paid ? "Paid" : "Due"}
                  </span>
                </Line>
              ))}
            </div>
          ) : (
            <div className="py-8 text-center text-sm" style={{ color: SOFT }}>
              No installments yet.
            </div>
          ))}

        {tab === "Compliance" && (
          <div className={glassCard}>
            <Line icon="shield" label="Compliance Status">
              <span
                className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs"
                style={{ background: tone.bg, color: tone.fg }}
              >
                <Icon name="check" size={13} />
                {compliance}
              </span>
            </Line>
            <Line icon="calendar" label="Last Payment">
              {lastPay ? fmtDate(lastPay) : "-"}
            </Line>
            <Line icon="calendar" label="Next Due">
              {next ? fmtDate(next) : "-"}
            </Line>
            <Line icon="phone" label="Last Contact">
              {c.lastContactDate ? fmtDate(c.lastContactDate) : "-"}
            </Line>
            <Line icon="chat" label="Contact Method">
              {c.contactMethod || "-"}
            </Line>
            <Line icon="briefcase" label="Floor">
              {c.floor || "-"}
            </Line>
          </div>
        )}

        {tab === "Notes" && (
          <>
            <div className={`${glassCard} p-3.5 text-[13px]`}>
              <div className="mb-1 text-xs font-bold" style={{ color: SOFT }}>
                Remarks
              </div>
              <div className="whitespace-pre-wrap font-medium">{c.remarks || "-"}</div>
            </div>
            <div className={`${glassCard} p-3.5 text-[13px]`}>
              <div className="mb-1 text-xs font-bold" style={{ color: SOFT }}>
                Contact notes
              </div>
              <div className="whitespace-pre-wrap font-medium">{c.contactNotes || "-"}</div>
            </div>
          </>
        )}
      </div>

      {/* footer */}
      <div className="flex gap-2.5 border-t border-[#6a72c8]/15 px-5 py-3.5">
        <button
          type="button"
          onClick={() => {
            closeCandidateCard();
            editCandidate(c.id);
          }}
          className="inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-bold text-white shadow-[0_8px_18px_-6px_rgba(47,124,246,0.7)] transition-transform hover:scale-[1.03]"
          style={{ background: BLUE_GRAD }}
        >
          <Icon name="pencil" size={15} />
          Edit
        </button>
        <button
          type="button"
          onClick={() => {
            closeCandidateCard();
            navigate("master");
            requestCandidateFocus(c.id);
          }}
          className="inline-flex flex-1 items-center justify-center gap-2 rounded-full border border-white/80 bg-white/80 px-4 py-2.5 text-sm font-bold shadow-sm transition-transform hover:scale-[1.02]"
          style={{ color: INK }}
        >
          View Full Details
          <Icon name="arrow" size={15} />
        </button>
      </div>
    </aside>
  );
}
