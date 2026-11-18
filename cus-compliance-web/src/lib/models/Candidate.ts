import mongoose, { Schema, models, model } from "mongoose";

const InstallmentSchema = new Schema(
  {
    amount: { type: String, default: "" },
    date: { type: String, default: "" },
    paid: { type: Boolean, default: false },
    receipt: { type: String, default: "" },
    notes: { type: String, default: "" },
    paymentDate: { type: String, default: "" },
  },
  { _id: false }
);

const MessageLogSchema = new Schema(
  {
    id: Number,
    template: String,
    timestamp: String,
    message: String,
  },
  { _id: false }
);

const CandidateSchema = new Schema(
  {
    id: { type: Number, required: true, unique: true, index: true },
    name: { type: String, default: "" },
    phoneNumber: { type: String, default: "" },
    assignedTo: { type: String, default: "" },
    floor: { type: String, default: "" },
    annualPackage: { type: Number, default: 0 },
    serviceFeePercent: { type: Number, default: 0 },
    totalServiceFee: { type: Number, default: 0 },
    terms: { type: String, default: "" },
    po: { type: String, default: "" },
    poMonth: { type: String, default: "" },
    startDate: { type: String, default: "" },
    salaryType: { type: String, default: "" },
    monthlyInstallment: { type: Number, default: 0 },
    status: { type: String, default: "Active" },
    remarks: { type: String, default: "" },
    installmentCount: { type: Number, default: 0 },
    installments: { type: [InstallmentSchema], default: [] },
    lastContactDate: { type: String, default: "" },
    nextFollowUpDate: { type: String, default: "" },
    contactMethod: { type: String, default: "No Contact" },
    contactNotes: { type: String, default: "" },
    messageLog: { type: [MessageLogSchema], default: [] },
    expectedDate: { type: String, default: "" },
    expectedAmount: { type: Schema.Types.Mixed, default: "" },
    monthRemarks: { type: String, default: "" },
    targetPaidManual: { type: Boolean, default: false },
    removedFromPaymentTarget: { type: Boolean, default: false },
    createdAt: { type: String, default: () => new Date().toISOString() },
    updatedAt: { type: String, default: () => new Date().toISOString() },
  },
  { versionKey: false }
);

// In dev, hot reload keeps the previously registered model alive - with its
// OLD schema. A field added later (e.g. salaryType) would then be silently
// dropped on every save. Re-register so the current schema always applies.
if (process.env.NODE_ENV !== "production" && models.Candidate) {
  mongoose.deleteModel("Candidate");
}

export const CandidateModel =
  models.Candidate || model("Candidate", CandidateSchema);
