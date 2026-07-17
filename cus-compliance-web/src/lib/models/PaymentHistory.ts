import mongoose, { Schema, models, model } from "mongoose";

const PaymentHistorySchema = new Schema(
  {
    id: { type: Number, required: true, unique: true, index: true },
    candidateId: { type: Number, default: 0 },
    candidateName: { type: String, default: "" },
    assignedTo: { type: String, default: "" },
    floor: { type: String, default: "" },
    date: { type: String, default: "" },
    amount: { type: Number, default: 0 },
    type: { type: String, default: "Payment" },
    notes: { type: String, default: "" },
    template: { type: String, default: "" },
    message: { type: String, default: "" },
    timestamp: { type: String, default: () => new Date().toISOString() },
  },
  { versionKey: false }
);

export const PaymentHistoryModel =
  models.PaymentHistory || model("PaymentHistory", PaymentHistorySchema);
