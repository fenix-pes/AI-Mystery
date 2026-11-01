import { Schema, model } from "mongoose";

const mysteryCaseSchema = new Schema({
  ownerId: { type: Schema.Types.ObjectId, required: true, index: true },
  idempotencyKey: { type: String, required: true },
  title: String,
  scenario: { type: String, required: true },
  category: String,
  difficulty: { type: String, enum: ["easy", "medium", "hard"], required: true },
  tone: String,
  caseLength: { type: String, enum: ["short", "standard", "extended"], required: true },
  status: { type: String, enum: ["queued", "generating", "validating", "ready", "failed"], default: "queued", index: true },
  currentStage: { type: String, default: "queued" },
  safeErrorCode: String,
  incident: Schema.Types.Mixed,
  suspects: { type: [Schema.Types.Mixed], default: [] },
  evidence: { type: [Schema.Types.Mixed], default: [] },
  timeline: { type: [Schema.Types.Mixed], default: [] },
  solution: Schema.Types.Mixed,
  generation: {
    provider: { type: String, default: "gemini" },
    model: String,
    promptVersion: String,
    attempts: { type: Number, default: 0 },
    lastErrorCode: String
  },
  publishedAt: Date
}, { timestamps: true, minimize: false });

mysteryCaseSchema.index({ ownerId: 1, idempotencyKey: 1 }, { unique: true });
mysteryCaseSchema.index({ ownerId: 1, createdAt: -1 });

export const MysteryCase = model("MysteryCase", mysteryCaseSchema);
