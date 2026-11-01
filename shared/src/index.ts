import { z } from "zod";

export const caseGenerationRequestSchema = z.object({
  scenario: z.string().trim().min(30, "Describe the mystery in at least 30 characters.").max(2000),
  category: z.string().trim().max(60).optional(),
  difficulty: z.enum(["easy", "medium", "hard"]).default("medium"),
  tone: z.string().trim().max(60).optional(),
  caseLength: z.enum(["short", "standard", "extended"]).default("standard")
});

export type CaseGenerationRequest = z.infer<typeof caseGenerationRequestSchema>;

export const apiErrorSchema = z.object({
  success: z.literal(false),
  error: z.object({ code: z.string(), message: z.string(), details: z.unknown().optional() })
});

export type ApiError = z.infer<typeof apiErrorSchema>;
