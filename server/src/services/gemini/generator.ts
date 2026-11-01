import { GoogleGenAI } from "@google/genai";
import { env } from "../../config/env.js";
import { CASE_PLANNING_PROMPT_VERSION, casePlanningPrompt, EVIDENCE_PROMPT_VERSION, evidencePrompt, CONSISTENCY_PROMPT_VERSION, consistencyPrompt, EVIDENCE_REPAIR_PROMPT_VERSION, evidenceRepairPrompt } from "../../prompts/case-planning.v1.js";
import { consistencyReviewSchema, evidenceSchema, planSchema, validateMystery, type MysteryPlan } from "../../modules/generation/schemas.js";
import type { CaseGenerationRequest } from "@mystery-room/shared";

const ai = env.GEMINI_API_KEY ? new GoogleGenAI({ apiKey: env.GEMINI_API_KEY, httpOptions: { timeout: env.GENERATION_TIMEOUT_MS } }) : undefined;
const toJsonSchema = (schema: typeof planSchema | typeof evidenceSchema | typeof consistencyReviewSchema) => {
  const jsonSchema = schema.toJSONSchema({ target: "draft-07" }) as Record<string, unknown>;
  delete jsonSchema.$schema;
  const removeUnsupported = (value: unknown): void => {
    if (Array.isArray(value)) { value.forEach(removeUnsupported); return; }
    if (!value || typeof value !== "object") return;
    const record = value as Record<string, unknown>;
    delete record.minLength;
    Object.values(record).forEach(removeUnsupported);
  };
  removeUnsupported(jsonSchema);
  return jsonSchema;
};

async function generateJson<T>(prompt: string, schema: typeof planSchema | typeof evidenceSchema | typeof consistencyReviewSchema, parse: (input: unknown) => T): Promise<T> {
  if (!ai) throw new Error("GEMINI_NOT_CONFIGURED");
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const response = await Promise.race([
      ai.models.generateContent({
      model: env.GEMINI_MODEL,
      contents: prompt,
      config: { responseMimeType: "application/json", responseSchema: toJsonSchema(schema), maxOutputTokens: 12000 }
      }),
      new Promise<never>((_resolve, reject) => { timer = setTimeout(() => reject(new Error("PROVIDER_TIMEOUT")), env.GENERATION_TIMEOUT_MS); })
    ]);
    if (!response.text) throw new Error("MALFORMED_AI_OUTPUT");
    return parse(JSON.parse(response.text));
  } finally { if (timer) clearTimeout(timer); }
}

async function reviewMystery(plan: MysteryPlan, evidence: Awaited<ReturnType<typeof evidenceSchema.parse>>): Promise<void> {
  const review = await generateJson(consistencyPrompt(JSON.stringify(plan), JSON.stringify(evidence)), consistencyReviewSchema, value => consistencyReviewSchema.parse(value));
  if (!review.uniquelySolvable || !review.solutionSupported || !review.noFatalContradictions || !review.allRequiredEvidencePresent) {
    throw new Error(`CASE_VALIDATION_FAILED: ${review.issues.join(" ").slice(0, 500) || "Independent consistency review rejected the case."}`);
  }
}

export interface GeneratedCase { plan: MysteryPlan; evidence: Awaited<ReturnType<typeof evidenceSchema.parse>>; promptVersion: string }

export async function generateMystery(input: CaseGenerationRequest, onStage?: (stage: string) => Promise<void>): Promise<GeneratedCase> {
  await onStage?.("establishing_solution");
  const plan = await generateJson(casePlanningPrompt(input), planSchema, value => planSchema.parse(value));
  await onStage?.("building_evidence");
  const planJson = JSON.stringify(plan);
  let evidence = await generateJson(evidencePrompt(planJson), evidenceSchema, value => evidenceSchema.parse(value));
  for (let repair = 0; ; repair += 1) {
    try {
      await onStage?.("checking_consistency");
      validateMystery(plan, evidence, input.difficulty);
      await reviewMystery(plan, evidence);
      break;
    } catch (cause) {
      if (repair >= env.GENERATION_MAX_REPAIRS) throw cause;
      await onStage?.("repairing_evidence");
      const issues = cause instanceof Error ? cause.message.slice(0, 1000) : "Consistency validation failed.";
      evidence = await generateJson(evidenceRepairPrompt(planJson, JSON.stringify(evidence), issues), evidenceSchema, value => evidenceSchema.parse(value));
    }
  }
  return { plan, evidence, promptVersion: `${CASE_PLANNING_PROMPT_VERSION}+${EVIDENCE_PROMPT_VERSION}+${EVIDENCE_REPAIR_PROMPT_VERSION}+${CONSISTENCY_PROMPT_VERSION}` };
}
