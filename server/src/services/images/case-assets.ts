import { Asset } from "../../models/Asset.js";
import { MysteryCase } from "../../models/MysteryCase.js";
import { getImageProvider } from "./provider.js";
import { deleteImage, deleteImages, saveImage } from "../storage/local.js";

const maxImagesPerCase = 3;

export async function generateCaseImages(caseId: string, ownerId: string, evidence: any[]): Promise<void> {
  const provider = getImageProvider();
  if (!provider) return;
  const candidates = evidence.filter(item => item.type === "image" || item.type === "cctv").slice(0, maxImagesPerCase);
  for (const item of candidates) {
    let asset: any;
    let storageKey: string | undefined;
    try {
      asset = await Asset.create({ caseId, ownerId, evidenceId: item.id, kind: "evidence_image", status: "pending", provider: "gemini" });
      const style = item.type === "cctv"
        ? "A fictional CCTV-style surveillance still, monochrome low-light scene, soft grain, no readable text, no real footage, no identifiable real person."
        : "A fictional evidence photograph for a detective game, cinematic documentary style, no readable text, no real person likeness, non-graphic.";
      const prompt = `${style} Create only a visual depiction from this fictional case evidence. Do not add facts or reveal a culprit. Scene: ${item.summary}. Context: ${item.content.slice(0, 900)}. Source: ${item.sourceDescription}.`;
      const generated = await provider.generate(prompt);
      storageKey = await saveImage(generated.data, generated.mimeType);
      const stored = await Asset.findOneAndUpdate({ _id: asset._id, status: "pending" }, { $set: { status: "ready", storageKey, mimeType: generated.mimeType, sizeBytes: generated.data.length } }, { new: true });
      if (!stored) { await deleteImage(storageKey); continue; }
      const linked = await MysteryCase.updateOne({ _id: caseId, ownerId, status: "ready", "evidence.id": item.id }, { $set: { "evidence.$.assetId": asset.id } });
      if (linked.matchedCount === 0) {
        await deleteImage(storageKey);
        await Asset.deleteOne({ _id: asset._id });
      }
    } catch (cause) {
      if (storageKey) await deleteImage(storageKey).catch(() => undefined);
      if (asset) await Asset.updateOne({ _id: asset._id }, { $set: { status: "failed", safeErrorCode: "ASSET_GENERATION_FAILED" } }).catch(() => undefined);
      console.error("Evidence image generation failed", { caseId, evidenceId: item.id, name: cause instanceof Error ? cause.name : "UnknownError" });
    }
  }
}

export async function removeCaseImages(caseId: string, ownerId: string): Promise<void> {
  const assets = await Asset.find({ caseId, ownerId }).select({ storageKey: 1 }).lean();
  const keys = assets.map(asset => asset.storageKey).filter((key): key is string => typeof key === "string");
  await deleteImages(keys);
  await Asset.deleteMany({ caseId, ownerId });
}
