import { Schema, models, model } from "mongoose";

/**
 * Team task / urgent note shown in the header marquee. One shared list for
 * every CRM user (compliance users and admins).
 */
const TaskSchema = new Schema(
  {
    text: { type: String, required: true, maxlength: 300 },
    urgent: { type: Boolean, default: false },
    createdBy: { type: String, default: "" },
    updatedBy: { type: String, default: "" },
  },
  { timestamps: true, versionKey: false }
);

export const TaskModel = models.CrmTask || model("CrmTask", TaskSchema);
