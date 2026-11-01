import { Schema, model } from "mongoose";

const noteSchema = new Schema({
  id: { type: String, required: true },
  content: { type: String, required: true, maxlength: 4000 }
}, { timestamps: true });

const progressSchema = new Schema({
  caseId: { type: Schema.Types.ObjectId, required: true, index: true },
  ownerId: { type: Schema.Types.ObjectId, required: true, index: true },
  investigatedEvidenceIds: { type: [String], default: [] },
  notes: { type: [noteSchema], default: [] },
  accusationSubmitted: { type: Boolean, default: false }
}, { timestamps: true });

progressSchema.index({ caseId: 1, ownerId: 1 }, { unique: true });
export const InvestigationProgress = model("InvestigationProgress", progressSchema);
