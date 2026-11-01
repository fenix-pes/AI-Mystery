import { Schema, model } from "mongoose";

const assetSchema = new Schema({
  caseId: { type: Schema.Types.ObjectId, required: true, index: true },
  ownerId: { type: Schema.Types.ObjectId, required: true, index: true },
  evidenceId: { type: String, required: true },
  kind: { type: String, enum: ["portrait", "evidence_image"], default: "evidence_image" },
  status: { type: String, enum: ["pending", "ready", "failed"], default: "pending" },
  storageKey: String,
  mimeType: String,
  sizeBytes: Number,
  provider: String,
  safeErrorCode: String
}, { timestamps: true });

assetSchema.index({ caseId: 1, ownerId: 1, evidenceId: 1 }, { unique: true });
export const Asset = model("Asset", assetSchema);
