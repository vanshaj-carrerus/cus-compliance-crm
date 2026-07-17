import { describe, expect, it } from "vitest";
import { getRemaining, getTotalPaid, money, parseMoney } from "./calc";
import { normalizeCandidate } from "./normalize";

describe("crm calc", () => {
  it("parses money and formats values", () => {
    expect(parseMoney("$1,250.50")).toBe(1250.5);
    expect(money(1250.5)).toContain("1,250");
  });

  it("computes paid and remaining from installments", () => {
    const c = normalizeCandidate({
      name: "Test",
      annualPackage: 100000,
      serviceFeePercent: 10,
      installmentCount: 2,
      installments: [
        { amount: "5000", date: "2026-01-01", paid: true, paymentDate: "2026-01-01", receipt: "", notes: "" },
        { amount: "5000", date: "2026-02-01", paid: false, paymentDate: "", receipt: "", notes: "" },
      ],
    });
    expect(getTotalPaid(c)).toBe(5000);
    expect(getRemaining(c)).toBe(5000);
  });
});
