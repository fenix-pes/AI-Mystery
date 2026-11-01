import { Schema, model } from "mongoose";

const accusationSchema = new Schema({
  caseId: { type: Schema.Types.ObjectId, required: true },
  ownerId: { type: Schema.Types.ObjectId, required: true },
  selectedSuspectId: { type: String, required: true },
  explanation: { type: String, maxlength: 1000 },
  verdict: { type: String, enum: ["correct", "incorrect"], required: true },
  submittedAt: { type: Date, default: Date.now }
});

accusationSchema.index({ caseId: 1, ownerId: 1 }, { unique: true });
export const Accusation = model("Accusation", accusationSchema);
