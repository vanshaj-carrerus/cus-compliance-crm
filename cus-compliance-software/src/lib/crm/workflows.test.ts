import { describe, expect, it } from "vitest";
import { defaultSettings, normalizeCandidate } from "./normalize";
import { runWorkflows } from "./workflows";
import { addDays, todayIso } from "./dates";

describe("workflows", () => {
  it("flags overdue unpaid installments for follow-up", () => {
    const candidate = normalizeCandidate({
      name: "Overdue Person",
      status: "Active",
      annualPackage: 100000,
      serviceFeePercent: 10,
      installmentCount: 1,
      installments: [
        {
          amount: "5000",
          date: addDays(todayIso(), -5),
          paid: false,
          paymentDate: "",
          receipt: "",
          notes: "",
        },
      ],
    });
    const settings = defaultSettings();
    const result = runWorkflows([candidate], settings, true);
    expect(result.changed).toBeGreaterThan(0);
    expect(result.overdueNotify).toBeGreaterThan(0);
    expect(result.candidates[0].nextFollowUpDate).toBe(todayIso());
  });
});
