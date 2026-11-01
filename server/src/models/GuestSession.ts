import { Schema, model } from "mongoose";

const guestSessionSchema = new Schema({
  tokenHash: { type: String, required: true, unique: true, index: true },
  expiresAt: { type: Date, required: true, index: { expires: 0 } }
}, { timestamps: { createdAt: true, updatedAt: false } });

export const GuestSession = model("GuestSession", guestSessionSchema);
