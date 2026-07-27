import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";

const AccessRequestSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    email: { type: String, required: true, lowercase: true, trim: true },
    name: { type: String, default: "" },
    /** Always requesting compliance_user access for now. */
    requestedRole: {
      type: String,
      default: "compliance_user",
    },
    message: { type: String, default: "" },
    status: {
      type: String,
      enum: ["pending", "approved", "denied"],
      default: "pending",
      index: true,
    },
    reviewedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
    reviewedAt: { type: Date, default: null },
    createdAt: { type: Date, default: Date.now },
  },
  { collection: "access_requests" }
);

AccessRequestSchema.index(
  { userId: 1, status: 1 },
  { unique: true, partialFilterExpression: { status: "pending" } }
);

export type AccessRequestDoc = InferSchemaType<typeof AccessRequestSchema> & {
  _id: mongoose.Types.ObjectId;
};

export const AccessRequest: Model<AccessRequestDoc> =
  mongoose.models.AccessRequest ||
  mongoose.model<AccessRequestDoc>("AccessRequest", AccessRequestSchema);
