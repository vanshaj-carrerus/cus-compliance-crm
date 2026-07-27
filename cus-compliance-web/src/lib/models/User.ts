import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";
import { USER_ROLES } from "@/lib/roles";

const UserSchema = new Schema(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    /** Empty until the invited user sets a password. */
    passwordHash: { type: String, default: "" },
    name: { type: String, default: "" },
    role: {
      type: String,
      enum: USER_ROLES,
      // No default: missing role is treated as normal "user" (no CRM access).
    },
    status: {
      type: String,
      enum: ["invited", "active"],
      default: "active",
    },
    /** Per-user page access. Undefined = derive from role (legacy). */
    features: { type: [String], default: undefined },
    createdAt: { type: Date, default: Date.now },
  },
  { collection: "users" }
);

export type UserDoc = InferSchemaType<typeof UserSchema> & {
  _id: mongoose.Types.ObjectId;
};

export const User: Model<UserDoc> =
  mongoose.models.User || mongoose.model<UserDoc>("User", UserSchema);
