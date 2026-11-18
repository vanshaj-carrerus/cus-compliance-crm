import type { Candidate } from "./types";
import { getRemaining, getTotalPaid } from "./calc";
import { fmtDate } from "./dates";

// Payment statement generator: renders a candidate's installment history to a
// canvas (-> PNG) and wraps that same image in a minimal single-page PDF.
// Read-only: it never touches candidate data.

const COMPANY = "CareerUS Solutions";
const W = 900; // logical px; rendered at SCALE x for sharpness
const SCALE = 2;
const PAD = 44;

const INK = "#0f172a";
const MUTED = "#64748b";
const LINE = "#e2e8f0";
const SOFT = "#f8fafc";
const WHITE = "#ffffff";
const GREEN = "#059669";
const ROSE = "#e11d48";
const AMBER = "#d97706";

// The whole statement takes its accent from the account state.
type Theme = { a: string; b: string; tint: string; label: string };
const THEMES: Record<"settled" | "overdue" | "active", Theme> = {
  settled: { a: "#047857", b: "#10b981", tint: "#ecfdf5", label: "Fully settled" },
  overdue: { a: "#9f1239", b: "#f43f5e", tint: "#fff1f2", label: "Payment overdue" },
  active: { a: "#312e81", b: "#6366f1", tint: "#eef2ff", label: "In progress" },
};

const usd = (n: number) =>
  "$" +
  (Math.round(n * 100) / 100).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

type Row = {
  no: number;
  due: string;
  amount: number;
  status: "Paid" | "Overdue" | "Upcoming";
};

function buildRows(c: Candidate): Row[] {
  const now = new Date();
  const rows: Row[] = [];
  (c.installments || []).forEach((i, idx) => {
    const amount = Number(i.amount) || 0;
    if (!amount) return;
    let status: Row["status"] = "Upcoming";
    if (i.paid) status = "Paid";
    else if (i.date && new Date(i.date + "T00:00:00") < now) status = "Overdue";
    rows.push({
      no: idx + 1,
      due: i.date ? fmtDate(i.date) : "No date",
      amount,
      status,
    });
  });
  return rows;
}

export function statementFileName(c: Candidate): string {
  const safe = (c.name || "candidate").replace(/[^a-z0-9]+/gi, "_").replace(/^_|_$/g, "");
  return `Payment_Statement_${safe || "candidate"}`;
}

export function renderStatementCanvas(c: Candidate): HTMLCanvasElement {
  const rows = buildRows(c);
  const total = Number(c.totalServiceFee) || 0;
  const paid = getTotalPaid(c);
  const remaining = getRemaining(c);
  const pct = total > 0 ? Math.min(1, paid / total) : 0;
  const hasOverdue = rows.some((r) => r.status === "Overdue");
  // Colors are fixed (indigo) for every statement; only the badge wording
  // reflects the account state.
  const theme: Theme = {
    ...THEMES.active,
    label:
      remaining <= 0 && total > 0
        ? THEMES.settled.label
        : hasOverdue
          ? THEMES.overdue.label
          : THEMES.active.label,
  };
  const nextIdx = rows.findIndex((r) => r.status !== "Paid");

  const HEAD_H = 150;
  const CARD_Y = 104;
  const CARD_H = 116;
  const BAL_Y = CARD_Y + CARD_H + 30;
  const BAL_H = 150;
  const TL_TITLE_Y = BAL_Y + BAL_H + 40;
  const ROW_H = 68;
  const TL_Y = TL_TITLE_Y + 28;
  const emptyH = rows.length ? 0 : 70;
  const FOOT_H = 80;
  const H = TL_Y + rows.length * ROW_H + emptyH + FOOT_H;

  const canvas = document.createElement("canvas");
  canvas.width = W * SCALE;
  canvas.height = H * SCALE;
  const ctx = canvas.getContext("2d")!;
  ctx.scale(SCALE, SCALE);
  const font = (w: number | string, s: number) =>
    `${w} ${s}px "Segoe UI", system-ui, -apple-system, Arial, sans-serif`;

  const text = (
    t: string,
    x: number,
    y: number,
    o: { f?: string; color?: string; align?: CanvasTextAlign; spacing?: string } = {}
  ) => {
    ctx.font = o.f || font(400, 14);
    ctx.fillStyle = o.color || INK;
    ctx.textAlign = o.align || "left";
    ctx.textBaseline = "middle";
    (ctx as unknown as { letterSpacing: string }).letterSpacing = o.spacing || "0px";
    ctx.fillText(t, x, y);
    (ctx as unknown as { letterSpacing: string }).letterSpacing = "0px";
  };
  const rrect = (
    x: number,
    y: number,
    w: number,
    h: number,
    r: number,
    fill: string | CanvasGradient,
    shadow = false
  ) => {
    ctx.save();
    if (shadow) {
      ctx.shadowColor = "rgba(15,23,42,0.14)";
      ctx.shadowBlur = 26;
      ctx.shadowOffsetY = 8;
    }
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.restore();
  };
  const grad = (x0: number, y0: number, x1: number, y1: number) => {
    const g = ctx.createLinearGradient(x0, y0, x1, y1);
    g.addColorStop(0, theme.a);
    g.addColorStop(1, theme.b);
    return g;
  };

  // page
  ctx.fillStyle = WHITE;
  ctx.fillRect(0, 0, W, H);

  // ── header: gradient with soft geometric shapes ─────────────────────────
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, W, HEAD_H);
  ctx.clip();
  ctx.fillStyle = grad(0, 0, W, HEAD_H);
  ctx.fillRect(0, 0, W, HEAD_H);
  ctx.fillStyle = "rgba(255,255,255,0.08)";
  ctx.beginPath();
  ctx.arc(W - 70, 20, 130, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,0.06)";
  ctx.beginPath();
  ctx.arc(W - 220, 150, 90, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,0.05)";
  ctx.beginPath();
  ctx.arc(120, 170, 80, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // logo mark + company
  rrect(PAD, 34, 34, 34, 10, "rgba(255,255,255,0.2)");
  text(COMPANY.charAt(0), PAD + 17, 52, { f: font(800, 19), color: WHITE, align: "center" });
  text(COMPANY, PAD + 46, 51, { f: font(700, 18), color: WHITE });
  text("PAYMENT STATEMENT", PAD, 90, {
    f: font(600, 12),
    color: "rgba(255,255,255,0.75)",
    spacing: "3px",
  });
  const today = new Date();
  text(fmtDate(today.toISOString().slice(0, 10)), W - PAD, 51, {
    f: font(700, 17),
    color: WHITE,
    align: "right",
  });

  // ── candidate card overlapping header ──────────────────────────────────
  rrect(PAD, CARD_Y, W - PAD * 2, CARD_H, 18, WHITE, true);
  // monogram
  const initials =
    (c.name || "?")
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0].toUpperCase())
      .join("") || "?";
  ctx.beginPath();
  ctx.arc(PAD + 52, CARD_Y + CARD_H / 2, 30, 0, Math.PI * 2);
  ctx.fillStyle = grad(PAD + 22, CARD_Y + 20, PAD + 82, CARD_Y + 90);
  ctx.fill();
  text(initials, PAD + 52, CARD_Y + CARD_H / 2 + 1, {
    f: font(700, 20),
    color: WHITE,
    align: "center",
  });
  text("PREPARED FOR", PAD + 100, CARD_Y + 30, { f: font(600, 10), color: MUTED, spacing: "2px" });
  text(c.name || "Unnamed candidate", PAD + 100, CARD_Y + 54, { f: font(700, 22) });
  const meta: [string, string][] = [
    ["Month", c.poMonth],
  ].filter(([, v]) => !!v) as [string, string][];
  let mx = PAD + 100;
  meta.forEach(([k, v]) => {
    ctx.font = font(500, 12);
    const label = `${k}  ${v}`;
    const w = ctx.measureText(label).width + 22;
    rrect(mx, CARD_Y + 74, w, 24, 12, theme.tint);
    text(k, mx + 11, CARD_Y + 86, { f: font(600, 11), color: theme.a });
    ctx.font = font(600, 11);
    const kw = ctx.measureText(k).width;
    text(v, mx + 11 + kw + 8, CARD_Y + 86, { f: font(500, 12), color: INK });
    mx += w + 8;
  });
  // state badge
  ctx.font = font(700, 11);
  const badgeW = ctx.measureText(theme.label.toUpperCase()).width + 30;
  rrect(W - PAD - 20 - badgeW, CARD_Y + 22, badgeW, 26, 13, grad(0, 0, badgeW, 0));
  text(theme.label.toUpperCase(), W - PAD - 20 - badgeW / 2, CARD_Y + 35, {
    f: font(700, 11),
    color: WHITE,
    align: "center",
    spacing: "1px",
  });

  // ── balance overview: ring | figures | remaining ───────────────────────
  const cx = PAD + 78;
  const cy = BAL_Y + BAL_H / 2;
  ctx.lineWidth = 16;
  ctx.lineCap = "round";
  ctx.strokeStyle = LINE;
  ctx.beginPath();
  ctx.arc(cx, cy, 62, 0, Math.PI * 2);
  ctx.stroke();
  if (pct > 0) {
    ctx.strokeStyle = grad(cx - 62, cy - 62, cx + 62, cy + 62);
    ctx.beginPath();
    ctx.arc(cx, cy, 62, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * pct);
    ctx.stroke();
  }
  text(`${Math.round(pct * 100)}%`, cx, cy - 6, { f: font(800, 30), align: "center" });
  text("PAID", cx, cy + 20, { f: font(600, 10), color: MUTED, align: "center", spacing: "2px" });

  const fx = PAD + 190;
  const figure = (label: string, val: string, y: number, dot: string) => {
    ctx.beginPath();
    ctx.arc(fx + 5, y + 2, 5, 0, Math.PI * 2);
    ctx.fillStyle = dot;
    ctx.fill();
    text(label, fx + 20, y - 14, { f: font(600, 10), color: MUTED, spacing: "2px" });
    text(val, fx + 20, y + 10, { f: font(700, 24) });
  };
  figure("TOTAL FEE", usd(total), BAL_Y + 46, "#94a3b8");
  figure("AMOUNT PAID", usd(paid), BAL_Y + 112, GREEN);

  const rx = PAD + 440;
  const rw = W - PAD - rx;
  rrect(rx, BAL_Y + 8, rw, BAL_H - 16, 20, grad(rx, BAL_Y, rx + rw, BAL_Y + BAL_H));
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(rx, BAL_Y + 8, rw, BAL_H - 16, 20);
  ctx.clip();
  ctx.fillStyle = "rgba(255,255,255,0.1)";
  ctx.beginPath();
  ctx.arc(rx + rw - 20, BAL_Y + 20, 70, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  text("REMAINING BALANCE", rx + 26, BAL_Y + 44, {
    f: font(600, 11),
    color: "rgba(255,255,255,0.8)",
    spacing: "2px",
  });
  text(usd(remaining), rx + 26, BAL_Y + 82, { f: font(800, 36), color: WHITE });
  const nextRow = nextIdx >= 0 ? rows[nextIdx] : null;
  text(
    remaining <= 0 && total > 0
      ? "Nothing left to pay"
      : nextRow
        ? `Next: ${usd(nextRow.amount)} · ${nextRow.due}`
        : `of ${usd(total)} total`,
    rx + 26,
    BAL_Y + 114,
    { f: font(500, 13), color: "rgba(255,255,255,0.85)" }
  );

  // ── timeline ───────────────────────────────────────────────────────────
  text("PAYMENT TIMELINE", PAD, TL_TITLE_Y, { f: font(700, 12), color: INK, spacing: "3px" });
  ctx.fillStyle = LINE;
  ctx.fillRect(PAD + 170, TL_TITLE_Y, W - PAD * 2 - 170, 1);

  const lineX = PAD + 16;
  if (rows.length > 1) {
    ctx.strokeStyle = LINE;
    ctx.lineWidth = 3;
    ctx.lineCap = "butt";
    ctx.beginPath();
    ctx.moveTo(lineX, TL_Y + ROW_H / 2);
    ctx.lineTo(lineX, TL_Y + (rows.length - 1) * ROW_H + ROW_H / 2);
    ctx.stroke();
  }
  if (!rows.length) {
    text("No installments recorded yet.", W / 2, TL_Y + 30, {
      f: font(500, 14),
      color: MUTED,
      align: "center",
    });
  }
  rows.forEach((r, i) => {
    const top = TL_Y + i * ROW_H;
    const mid = top + ROW_H / 2;
    const col = r.status === "Paid" ? GREEN : r.status === "Overdue" ? ROSE : AMBER;
    const tint = r.status === "Paid" ? "#ecfdf5" : r.status === "Overdue" ? "#fff1f2" : "#fffbeb";

    // node
    ctx.beginPath();
    ctx.arc(lineX, mid, 13, 0, Math.PI * 2);
    ctx.fillStyle = r.status === "Paid" ? col : WHITE;
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = col;
    ctx.stroke();
    if (r.status === "Paid") {
      ctx.strokeStyle = WHITE;
      ctx.lineWidth = 2.5;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.beginPath();
      ctx.moveTo(lineX - 5, mid + 0.5);
      ctx.lineTo(lineX - 1.5, mid + 4);
      ctx.lineTo(lineX + 5, mid - 3.5);
      ctx.stroke();
    } else {
      text(String(r.no), lineX, mid + 1, { f: font(700, 11), color: col, align: "center" });
    }

    // card
    const cxl = PAD + 46;
    const cw = W - PAD - cxl;
    rrect(cxl, top + 5, cw, ROW_H - 10, 14, i === nextIdx ? tint : SOFT);
    if (i === nextIdx) {
      ctx.save();
      ctx.beginPath();
      ctx.roundRect(cxl, top + 5, cw, ROW_H - 10, 14);
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = col;
      ctx.stroke();
      ctx.restore();
    }
    text(`Installment ${r.no}`, cxl + 20, mid - 9, { f: font(700, 15) });
    // Always the installment's own date - the same one shown in the sheet cell.
    const sub = r.status === "Paid" ? `Paid on ${r.due}` : `Due ${r.due}`;
    text(sub, cxl + 20, mid + 11, { f: font(500, 12), color: MUTED });
    text(usd(r.amount), cxl + cw - 130, mid, { f: font(700, 18), align: "right" });
    rrect(cxl + cw - 108, mid - 13, 92, 26, 13, col);
    text(r.status.toUpperCase(), cxl + cw - 62, mid + 0.5, {
      f: font(700, 11),
      color: WHITE,
      align: "center",
      spacing: "1px",
    });
  });

  // ── footer ─────────────────────────────────────────────────────────────
  const fy = TL_Y + rows.length * ROW_H + emptyH + 26;
  ctx.fillStyle = grad(PAD, 0, W - PAD, 0);
  ctx.fillRect(PAD, fy, W - PAD * 2, 3);
  text(
    remaining > 0
      ? `Outstanding balance: ${usd(remaining)}`
      : "Account fully settled — thank you!",
    PAD,
    fy + 30,
    { f: font(700, 15), color: theme.a }
  );

  return canvas;
}

export function canvasToPngBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("PNG export failed"))), "image/png")
  );
}

// Single-page PDF embedding the canvas as a JPEG (DCTDecode). Page size is the
// image size in points, scaled to A4 width (595pt).
export function canvasToPdfBlob(canvas: HTMLCanvasElement): Blob {
  const dataUrl = canvas.toDataURL("image/jpeg", 0.92);
  const bin = atob(dataUrl.split(",")[1]);
  const jpeg = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) jpeg[i] = bin.charCodeAt(i);

  const pw = 595;
  const ph = Math.round((canvas.height / canvas.width) * pw);
  const enc = new TextEncoder();
  const parts: Uint8Array[] = [];
  const offsets: number[] = [];
  let len = 0;
  const push = (d: Uint8Array | string) => {
    const b = typeof d === "string" ? enc.encode(d) : d;
    parts.push(b);
    len += b.length;
  };
  const obj = (n: number, body: string) => {
    offsets[n] = len;
    push(`${n} 0 obj\n${body}\nendobj\n`);
  };

  push("%PDF-1.4\n");
  obj(1, "<< /Type /Catalog /Pages 2 0 R >>");
  obj(2, "<< /Type /Pages /Kids [3 0 R] /Count 1 >>");
  obj(
    3,
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pw} ${ph}] /Resources << /XObject << /Im0 5 0 R >> >> /Contents 4 0 R >>`
  );
  const content = `q ${pw} 0 0 ${ph} 0 0 cm /Im0 Do Q`;
  obj(4, `<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
  offsets[5] = len;
  push(
    `5 0 obj\n<< /Type /XObject /Subtype /Image /Width ${canvas.width} /Height ${canvas.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`
  );
  push(jpeg);
  push("\nendstream\nendobj\n");

  const xref = len;
  let x = "xref\n0 6\n0000000000 65535 f \n";
  for (let n = 1; n <= 5; n++) x += String(offsets[n]).padStart(10, "0") + " 00000 n \n";
  push(x + `trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`);

  return new Blob(parts as BlobPart[], { type: "application/pdf" });
}
