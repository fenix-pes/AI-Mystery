import { randomUUID } from "node:crypto";
import { Router } from "express";
import mongoose from "mongoose";
import { caseGenerationRequestSchema } from "@mystery-room/shared";
import { Accusation } from "../../models/Accusation.js";
import { InvestigationProgress } from "../../models/InvestigationProgress.js";
import { MysteryCase } from "../../models/MysteryCase.js";
import { requireGuest, type GuestRequest } from "../auth/session.js";
import { generateMystery } from "../../services/gemini/generator.js";
import { env } from "../../config/env.js";
import { publicCase, publicEvidence, publicSuspect, publicSuspects } from "./serializers.js";
import { evaluateAccusation } from "../accusations/verdict.js";
import { Asset } from "../../models/Asset.js";
import { generateCaseImages, removeCaseImages } from "../../services/images/case-assets.js";
import { readImage } from "../../services/storage/local.js";

const router = Router();
const idValid = (id: string) => mongoose.Types.ObjectId.isValid(id);
const error = (response: any, status: number, code: string, message: string) => response.status(status).json({ success: false, error: { code, message, correlationId: response.locals.correlationId } });
const ok = (response: any, data: unknown, message = "Request completed successfully") => response.json({ success: true, data, message });

async function ownedCase(caseId: string | string[], ownerId: string) {
  const normalizedId = Array.isArray(caseId) ? caseId[0] : caseId;
  if (!normalizedId || !idValid(normalizedId)) return null;
  return MysteryCase.findOne({ _id: normalizedId, ownerId });
}

async function runGeneration(caseId: string, input: any): Promise<void> {
  const caseDoc = await MysteryCase.findById(caseId);
  if (!caseDoc) return;
  const updateStage = async (stage: string) => {
    await MysteryCase.updateOne({ _id: caseId }, { $set: { currentStage: stage, status: stage === "checking_consistency" ? "validating" : "generating" }, $inc: { "generation.attempts": stage === "establishing_solution" ? 1 : 0 } });
  };
  for (let attempt = 1; attempt <= env.GENERATION_MAX_ATTEMPTS; attempt += 1) {
    try {
      await updateStage("understanding_scenario");
      const generated = await generateMystery(input, updateStage);
      const roles = new Map(generated.plan.plannedClues.map(clue => [clue.id, clue.role]));
      const purposes = new Map(generated.plan.plannedClues.map(clue => [clue.id, clue.purpose]));
      const evidence = generated.evidence.map(item => ({ ...item, clueRole: roles.get(item.id), plannedPurpose: purposes.get(item.id) }));
      const timeline = generated.plan.timeline.map(item => ({ ...item }));
      await MysteryCase.updateOne({ _id: caseId }, { $set: {
        title: generated.plan.title,
        incident: generated.plan.incident,
        suspects: generated.plan.suspects,
        timeline,
        evidence,
        solution: generated.plan.solution,
        status: "ready",
        currentStage: "ready",
        publishedAt: new Date(),
        "generation.model": env.GEMINI_MODEL,
        "generation.promptVersion": generated.promptVersion,
        "generation.lastErrorCode": ""
      } });
      void generateCaseImages(caseId, caseDoc.ownerId.toString(), evidence).catch(cause => console.error("Evidence image job failed", { caseId, name: cause instanceof Error ? cause.name : "UnknownError" }));
      return;
    } catch (cause) {
      const causeText = cause instanceof Error ? cause.message : "UNKNOWN";
      const code = causeText.startsWith("CASE_VALIDATION_FAILED") ? "VALIDATION_FAILED" : causeText === "PROVIDER_TIMEOUT" ? "PROVIDER_TIMEOUT" : causeText === "GEMINI_NOT_CONFIGURED" ? "PROVIDER_NOT_CONFIGURED" : "GENERATION_FAILED";
      console.error("Mystery generation attempt failed", { caseId, attempt, code });
      if (attempt < env.GENERATION_MAX_ATTEMPTS && code !== "PROVIDER_NOT_CONFIGURED") await new Promise(resolve => setTimeout(resolve, 500 * 2 ** (attempt - 1)));
      else {
        await MysteryCase.updateOne({ _id: caseId }, { $set: { status: "failed", currentStage: "failed", safeErrorCode: code, "generation.lastErrorCode": code } });
        return;
      }
    }
  }
}

function launchGeneration(caseId: string, input: any): void {
  void runGeneration(caseId, input).catch(async cause => {
    const code = "GENERATION_FAILED";
    console.error("Mystery generation worker failed", { caseId, name: cause instanceof Error ? cause.name : "UnknownError" });
    try { await MysteryCase.updateOne({ _id: caseId }, { $set: { status: "failed", currentStage: "failed", safeErrorCode: code, "generation.lastErrorCode": code } }); }
    catch { console.error("Could not persist mystery generation failure", { caseId }); }
  });
}

router.use(requireGuest);

router.get("/", async (request: GuestRequest, response, next) => {
  try {
    const page = Math.max(1, Number(request.query.page) || 1);
    const limit = Math.min(50, Math.max(1, Number(request.query.limit) || 20));
    const docs = await MysteryCase.find({ ownerId: request.ownerId }).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean();
    const count = await MysteryCase.countDocuments({ ownerId: request.ownerId });
    ok(response, { items: docs.map(doc => publicCase(doc)), page, limit, total: count });
  } catch (cause) { next(cause); }
});

router.post("/", async (request: GuestRequest, response, next) => {
  try {
    const parsed = caseGenerationRequestSchema.safeParse(request.body);
    if (!parsed.success) return error(response, 400, "INVALID_SCENARIO", "Check the scenario and generation settings.");
    const input = parsed.data;
    const suppliedKey = request.get("Idempotency-Key");
    if (!suppliedKey || suppliedKey.length > 128) return error(response, 400, "VALIDATION_ERROR", "A valid Idempotency-Key header is required.");
    const idempotencyKey = suppliedKey;
    const existing = await MysteryCase.findOne({ ownerId: request.ownerId, idempotencyKey });
    if (existing) return response.status(202).json({ success: true, data: { caseId: existing.id, status: existing.status }, message: "Generation request already accepted" });
    const recentCount = await MysteryCase.countDocuments({ ownerId: request.ownerId, createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } });
    if (recentCount >= 5) return error(response, 429, "GENERATION_LIMIT_EXCEEDED", "You have reached the daily case creation limit. Try again later.");
    const doc = await MysteryCase.create({ ownerId: request.ownerId, idempotencyKey, ...input, category: input.category || "any", tone: input.tone || "classic_detective", status: "queued", currentStage: "queued", generation: { provider: "gemini", model: env.GEMINI_MODEL, promptVersion: "case-planning-v1", attempts: 0 } });
    await InvestigationProgress.create({ caseId: doc._id, ownerId: request.ownerId });
    launchGeneration(doc.id, input);
    return response.status(202).json({ success: true, data: { caseId: doc.id, status: "queued" }, message: "Mystery generation accepted" });
  } catch (cause: any) {
    if (cause?.code === 11000) {
      const existing = await MysteryCase.findOne({ ownerId: request.ownerId, idempotencyKey: request.get("Idempotency-Key") });
      if (existing) return response.status(202).json({ success: true, data: { caseId: existing.id, status: existing.status }, message: "Generation request already accepted" });
    }
    next(cause);
  }
});

router.post("/:caseId/retry", async (request: GuestRequest, response, next) => {
  try {
    const doc = await ownedCase(request.params.caseId, request.ownerId!);
    if (!doc) return error(response, 404, "CASE_NOT_FOUND", "Case not found.");
    if (doc.status !== "failed") return error(response, 409, "GENERATION_IN_PROGRESS", "This case cannot be retried in its current state.");
    if (["PROVIDER_NOT_CONFIGURED", "GENERATION_LIMIT_EXCEEDED"].includes(doc.safeErrorCode || "")) return error(response, 409, "GENERATION_FAILED", "This failure cannot be retried until the server configuration changes.");
    const input = caseGenerationRequestSchema.parse({ scenario: doc.scenario, category: doc.category, difficulty: doc.difficulty, tone: doc.tone, caseLength: doc.caseLength });
    await MysteryCase.updateOne({ _id: doc._id }, { $set: { status: "queued", currentStage: "queued", safeErrorCode: "", "generation.lastErrorCode": "" } });
    launchGeneration(doc.id, input);
    return response.status(202).json({ success: true, data: { caseId: doc.id, status: "queued" }, message: "Case generation retry accepted" });
  } catch (cause) { next(cause); }
});

router.get("/:caseId/status", async (request: GuestRequest, response, next) => {
  try {
    const doc = await ownedCase(request.params.caseId, request.ownerId!);
    if (!doc) return error(response, 404, "CASE_NOT_FOUND", "Case not found.");
    ok(response, { caseId: doc.id, status: doc.status, currentStage: doc.currentStage, errorCode: doc.status === "failed" ? doc.safeErrorCode : undefined, retryEligible: doc.status === "failed" && !["PROVIDER_NOT_CONFIGURED", "GENERATION_LIMIT_EXCEEDED"].includes(doc.safeErrorCode || "") });
  } catch (cause) { next(cause); }
});

router.get("/:caseId/assets/:assetId", async (request: GuestRequest, response, next) => {
  try {
    const doc = await ownedCase(request.params.caseId, request.ownerId!);
    if (!doc) return error(response, 404, "CASE_NOT_FOUND", "Case not found.");
    const assetId = Array.isArray(request.params.assetId) ? request.params.assetId[0] : request.params.assetId;
    if (!assetId || !mongoose.Types.ObjectId.isValid(assetId)) return error(response, 404, "EVIDENCE_NOT_FOUND", "Asset not found.");
    const asset = await Asset.findOne({ _id: assetId, caseId: doc._id, ownerId: request.ownerId, status: "ready" });
    if (!asset?.storageKey || !asset.mimeType) return error(response, 404, "EVIDENCE_NOT_FOUND", "Asset not found.");
    const data = await readImage(asset.storageKey);
    response.setHeader("Content-Type", asset.mimeType);
    response.setHeader("Content-Length", data.length);
    response.setHeader("Cache-Control", "private, max-age=3600");
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
    response.send(data);
  } catch (cause) { next(cause); }
});

router.get("/:caseId/suspects", async (request: GuestRequest, response, next) => {
  try {
    const doc = await ownedCase(request.params.caseId, request.ownerId!);
    if (!doc) return error(response, 404, "CASE_NOT_FOUND", "Case not found.");
    if (doc.status !== "ready") return error(response, 409, "CASE_NOT_READY", "This investigation is not ready yet.");
    ok(response, publicSuspects(doc));
  } catch (cause) { next(cause); }
});

router.get("/:caseId/suspects/:suspectId", async (request: GuestRequest, response, next) => {
  try {
    const doc = await ownedCase(request.params.caseId, request.ownerId!);
    if (!doc) return error(response, 404, "CASE_NOT_FOUND", "Case not found.");
    if (doc.status !== "ready") return error(response, 409, "CASE_NOT_READY", "This investigation is not ready yet.");
    const suspect = doc.suspects.find((item: any) => item.id === request.params.suspectId);
    if (!suspect) return error(response, 404, "EVIDENCE_NOT_FOUND", "Suspect not found.");
    ok(response, { ...publicSuspect(suspect.toObject?.() ?? suspect), relevantEvidenceCount: doc.evidence.filter((item: any) => item.relatedSuspectIds?.includes(suspect.id)).length });
  } catch (cause) { next(cause); }
});

router.get("/:caseId/evidence", async (request: GuestRequest, response, next) => {
  try {
    const doc = await ownedCase(request.params.caseId, request.ownerId!);
    if (!doc) return error(response, 404, "CASE_NOT_FOUND", "Case not found.");
    if (doc.status !== "ready") return error(response, 409, "CASE_NOT_READY", "This investigation is not ready yet.");
    const query = String(request.query.q || "").toLowerCase();
    const type = String(request.query.type || "");
    const items = doc.evidence.map((item: any) => item.toObject?.() ?? item).filter((item: any) => (!type || item.type === type) && (!query || `${item.title} ${item.summary} ${item.content}`.toLowerCase().includes(query)));
    const page = Math.max(1, Number(request.query.page) || 1);
    const limit = Math.min(50, Math.max(1, Number(request.query.limit) || 20));
    ok(response, { items: items.slice((page - 1) * limit, page * limit).map(publicEvidence), page, limit, total: items.length });
  } catch (cause) { next(cause); }
});

router.get("/:caseId/evidence/:evidenceId", async (request: GuestRequest, response, next) => {
  try {
    const doc = await ownedCase(request.params.caseId, request.ownerId!);
    if (!doc) return error(response, 404, "CASE_NOT_FOUND", "Case not found.");
    if (doc.status !== "ready") return error(response, 409, "CASE_NOT_READY", "This investigation is not ready yet.");
    const item = doc.evidence.find((evidence: any) => evidence.id === request.params.evidenceId);
    if (!item) return error(response, 404, "EVIDENCE_NOT_FOUND", "Evidence not found.");
    const progress = await InvestigationProgress.findOne({ caseId: doc._id, ownerId: request.ownerId });
    if (progress && !progress.investigatedEvidenceIds.includes(item.id)) {
      progress.investigatedEvidenceIds.push(item.id);
      await progress.save();
    }
    ok(response, publicEvidence(item.toObject?.() ?? item));
  } catch (cause) { next(cause); }
});

router.get("/:caseId/timeline", async (request: GuestRequest, response, next) => {
  try {
    const doc = await ownedCase(request.params.caseId, request.ownerId!);
    if (!doc) return error(response, 404, "CASE_NOT_FOUND", "Case not found.");
    if (doc.status !== "ready") return error(response, 409, "CASE_NOT_READY", "This investigation is not ready yet.");
    ok(response, [...doc.timeline].sort((a: any, b: any) => String(a.timestamp).localeCompare(String(b.timestamp))));
  } catch (cause) { next(cause); }
});

router.get("/:caseId/progress", async (request: GuestRequest, response, next) => {
  try {
    const doc = await ownedCase(request.params.caseId, request.ownerId!);
    if (!doc) return error(response, 404, "CASE_NOT_FOUND", "Case not found.");
    const progress = await InvestigationProgress.findOne({ caseId: doc._id, ownerId: request.ownerId });
    ok(response, progress ?? { investigatedEvidenceIds: [], notes: [], accusationSubmitted: false });
  } catch (cause) { next(cause); }
});

router.patch("/:caseId/progress", async (request: GuestRequest, response, next) => {
  try {
    const doc = await ownedCase(request.params.caseId, request.ownerId!);
    if (!doc) return error(response, 404, "CASE_NOT_FOUND", "Case not found.");
    const ids = request.body?.investigatedEvidenceIds;
    if (!Array.isArray(ids) || ids.some((id: unknown) => typeof id !== "string" || !doc.evidence.some((item: any) => item.id === id))) return error(response, 400, "VALIDATION_ERROR", "One or more evidence IDs are invalid.");
    const progress = await InvestigationProgress.findOneAndUpdate({ caseId: doc._id, ownerId: request.ownerId }, { $set: { investigatedEvidenceIds: [...new Set(ids)] } }, { new: true, upsert: true, setDefaultsOnInsert: true });
    ok(response, progress);
  } catch (cause) { next(cause); }
});

router.post("/:caseId/notes", async (request: GuestRequest, response, next) => {
  try {
    const doc = await ownedCase(request.params.caseId, request.ownerId!);
    if (!doc) return error(response, 404, "CASE_NOT_FOUND", "Case not found.");
    const content = typeof request.body?.content === "string" ? request.body.content.trim() : "";
    if (!content || content.length > 4000) return error(response, 400, "VALIDATION_ERROR", "Notes must contain 1 to 4,000 characters.");
    const progress = await InvestigationProgress.findOneAndUpdate({ caseId: doc._id, ownerId: request.ownerId }, { $push: { notes: { id: randomUUID(), content } } }, { new: true, upsert: true, setDefaultsOnInsert: true });
    ok(response, progress.notes.at(-1), "Note created");
  } catch (cause) { next(cause); }
});

router.patch("/:caseId/notes/:noteId", async (request: GuestRequest, response, next) => {
  try {
    const doc = await ownedCase(request.params.caseId, request.ownerId!);
    if (!doc) return error(response, 404, "CASE_NOT_FOUND", "Case not found.");
    const content = typeof request.body?.content === "string" ? request.body.content.trim() : "";
    if (!content || content.length > 4000) return error(response, 400, "VALIDATION_ERROR", "Notes must contain 1 to 4,000 characters.");
    const progress = await InvestigationProgress.findOne({ caseId: doc._id, ownerId: request.ownerId });
    const note = progress?.notes.find(item => item.id === request.params.noteId);
    if (!note) return error(response, 404, "CASE_NOT_FOUND", "Note not found.");
    note.content = content;
    await progress!.save();
    ok(response, note);
  } catch (cause) { next(cause); }
});

router.delete("/:caseId/notes/:noteId", async (request: GuestRequest, response, next) => {
  try {
    const doc = await ownedCase(request.params.caseId, request.ownerId!);
    if (!doc) return error(response, 404, "CASE_NOT_FOUND", "Case not found.");
    const progress = await InvestigationProgress.findOne({ caseId: doc._id, ownerId: request.ownerId });
    if (!progress?.notes.some(item => item.id === request.params.noteId)) return error(response, 404, "CASE_NOT_FOUND", "Note not found.");
    progress.notes = progress.notes.filter(item => item.id !== request.params.noteId) as any;
    await progress.save();
    response.status(204).end();
  } catch (cause) { next(cause); }
});

router.post("/:caseId/accusations", async (request: GuestRequest, response, next) => {
  try {
    const doc = await ownedCase(request.params.caseId, request.ownerId!);
    if (!doc) return error(response, 404, "CASE_NOT_FOUND", "Case not found.");
    if (doc.status !== "ready") return error(response, 409, "CASE_NOT_READY", "This investigation is not ready yet.");
    const suspectId = request.body?.selectedSuspectId;
    if (typeof suspectId !== "string" || !doc.suspects.some((item: any) => item.id === suspectId)) return error(response, 400, "INVALID_SUSPECT", "Select a suspect from this case.");
    const explanation = typeof request.body?.explanation === "string" ? request.body.explanation.trim() : undefined;
    if (explanation && explanation.length > 1000) return error(response, 400, "VALIDATION_ERROR", "The explanation must be 1,000 characters or fewer.");
    const verdict = evaluateAccusation(suspectId, (doc.solution as any).culpritId);
    const reservation = await InvestigationProgress.findOneAndUpdate(
      { caseId: doc._id, ownerId: request.ownerId, accusationSubmitted: { $ne: true } },
      { $set: { accusationSubmitted: true } },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );
    if (!reservation) return error(response, 409, "ACCUSATION_ALREADY_SUBMITTED", "An accusation has already been submitted for this case.");
    let accusation;
    try {
      accusation = await Accusation.create({ caseId: doc._id, ownerId: request.ownerId, selectedSuspectId: suspectId, explanation, verdict });
    } catch (cause) {
      if ((cause as any)?.code === 11000) return error(response, 409, "ACCUSATION_ALREADY_SUBMITTED", "An accusation has already been submitted for this case.");
      await InvestigationProgress.updateOne({ caseId: doc._id, ownerId: request.ownerId }, { $set: { accusationSubmitted: false } }).catch(() => undefined);
      throw cause;
    }
    response.status(201).json({ success: true, data: { verdict, selectedSuspectId: accusation.selectedSuspectId, submittedAt: accusation.submittedAt }, message: "Accusation recorded" });
  } catch (cause: any) {
    if (cause?.code === 11000) return error(response, 409, "ACCUSATION_ALREADY_SUBMITTED", "An accusation has already been submitted for this case.");
    next(cause);
  }
});

router.get("/:caseId/result", async (request: GuestRequest, response, next) => {
  try {
    const doc = await ownedCase(request.params.caseId, request.ownerId!);
    if (!doc) return error(response, 404, "CASE_NOT_FOUND", "Case not found.");
    const accusation = await Accusation.findOne({ caseId: doc._id, ownerId: request.ownerId });
    if (!accusation) return error(response, 403, "UNAUTHORIZED", "Submit an accusation before viewing the solution.");
    const solution = doc.solution as any;
    const decisive = solution.decisiveEvidenceIds.map((id: string) => doc.evidence.find((item: any) => item.id === id)).filter(Boolean).map((item: any) => ({ ...publicEvidence(item.toObject?.() ?? item), explanation: item.plannedPurpose ?? "This clue is part of the decisive evidence." }));
    const culprit = doc.suspects.find((item: any) => item.id === solution.culpritId);
    const selectedSuspect = doc.suspects.find((item: any) => item.id === accusation.selectedSuspectId);
    ok(response, { verdict: accusation.verdict, selectedSuspect: selectedSuspect ? publicSuspect(selectedSuspect) : undefined, culprit: culprit ? publicSuspect(culprit) : undefined, solution: { motive: solution.motive, method: solution.method, reconstruction: solution.reconstruction, decisiveEvidence: decisive, redHerringExplanations: solution.redHerringExplanations } });
  } catch (cause) { next(cause); }
});

router.get("/:caseId", async (request: GuestRequest, response, next) => {
  try {
    const doc = await ownedCase(request.params.caseId, request.ownerId!);
    if (!doc) return error(response, 404, "CASE_NOT_FOUND", "Case not found.");
    if (doc.status !== "ready") return error(response, 409, "CASE_NOT_READY", "This investigation is not ready yet.");
    const progress = await InvestigationProgress.findOne({ caseId: doc._id, ownerId: request.ownerId });
    ok(response, publicCase(doc.toObject(), progress));
  } catch (cause) { next(cause); }
});

router.delete("/:caseId", async (request: GuestRequest, response, next) => {
  try {
    const doc = await ownedCase(request.params.caseId, request.ownerId!);
    if (!doc) return error(response, 404, "CASE_NOT_FOUND", "Case not found.");
    await removeCaseImages(doc.id, request.ownerId!);
    await Promise.all([
      InvestigationProgress.deleteMany({ caseId: doc._id, ownerId: request.ownerId }),
      Accusation.deleteMany({ caseId: doc._id, ownerId: request.ownerId }),
      doc.deleteOne()
    ]);
    response.status(204).end();
  } catch (cause) { next(cause); }
});

export { router as casesRouter };
