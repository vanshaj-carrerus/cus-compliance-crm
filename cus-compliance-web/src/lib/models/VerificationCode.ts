import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";

const VerificationCodeSchema = new Schema(
  {
    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    code: { type: String, required: true },
    expires: { type: Number, required: true },
  },
  { collection: "verification_codes" }
);

export type VerificationCodeDoc = InferSchemaType<
  typeof VerificationCodeSchema
> & {
  _id: mongoose.Types.ObjectId;
};

export const VerificationCode: Model<VerificationCodeDoc> =
  mongoose.models.VerificationCode ||
  mongoose.model<VerificationCodeDoc>(
    "VerificationCode",
    VerificationCodeSchema
  );
