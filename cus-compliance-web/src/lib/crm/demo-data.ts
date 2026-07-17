import type { Candidate } from "./types";
import { normalizeCandidate } from "./normalize";

const inst = (
  amount: string,
  date: string,
  paid: boolean,
  paymentDate = ""
) => ({
  amount,
  date,
  paid,
  receipt: "",
  notes: "",
  paymentDate: paid ? paymentDate || date : "",
});

export function demoData(): Candidate[] {
  return [
    normalizeCandidate({
      id: 1,
      name: "John Smith",
      assignedTo: "Yatin",
      floor: "3rd Floor",
      annualPackage: 100000,
      serviceFeePercent: 5,
      terms: "4 installments",
      po: "PO-001",
      poMonth: "January 2026",
      startDate: "2026-01-15",
      status: "Active",
      remarks: "Demo candidate",
      phoneNumber: "15551234567",
      installments: [
        inst("1500", "2026-01-14", true, "2026-01-14"),
        inst("1167", "2026-02-12", false),
        inst("1167", "2026-03-16", false),
        inst("1166", "2026-04-24", false),
      ],
    }),
    normalizeCandidate({
      id: 2,
      name: "Sarah Johnson",
      assignedTo: "Jayraj",
      floor: "5th Floor",
      annualPackage: 120000,
      serviceFeePercent: 5,
      terms: "5 installments",
      po: "PO-002",
      poMonth: "February 2026",
      startDate: "2026-02-01",
      status: "Active",
      remarks: "Demo candidate",
      phoneNumber: "15559876543",
      installments: [
        inst("1500", "2026-02-25", true, "2026-02-25"),
        inst("1125", "2026-03-25", false),
        inst("1125", "2026-04-25", false),
        inst("1125", "2026-05-25", false),
        inst("1125", "2026-06-25", false),
      ],
    }),
  ];
}
