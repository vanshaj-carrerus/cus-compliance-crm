import { Schema, models, model } from "mongoose";

const SettingsSchema = new Schema(
  {
    key: { type: String, required: true, unique: true, default: "settings" },
    value: { type: Schema.Types.Mixed, default: {} },
  },
  { versionKey: false }
);

export const SettingsModel =
  models.CrmSettings || model("CrmSettings", SettingsSchema);
