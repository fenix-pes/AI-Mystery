import { z } from "zod";

const text = z.string().trim().min(1);
export const suspectSchema = z.object({
  id: text,
  name: text,
  age: z.number().int().min(16).max(120).optional(),
  occupation: text,
  relationshipToIncident: text,
  publicBiography: text,
  publicMotive: text,
  publicAlibi: text,
  statement: text,
  knownFacts: z.array(text).min(1),
  privateNotes: text
});

export const timelineSchema = z.object({
  id: text,
  timestamp: text,
  title: text,
  description: text,
  relatedSuspectIds: z.array(text),
  relatedEvidenceIds: z.array(text)
});

export const plannedClueSchema = z.object({
  id: text,
  title: text,
  role: z.enum(["supporting", "contradictory", "red_herring", "neutral"]),
  purpose: text
});

export const planSchema = z.object({
  title: text,
  incident: z.object({
    summary: text,
    incidentType: text,
    location: text,
    incidentTime: text,
    background: text
  }),
  suspects: z.array(suspectSchema).min(3).max(6),
  timeline: z.array(timelineSchema).min(4),
  plannedClues: z.array(plannedClueSchema).min(6).max(18),
  solution: z.object({
    culpritId: text,
    motive: text,
    method: text,
    reconstruction: text,
    decisiveEvidenceIds: z.array(text).min(2),
    redHerringExplanations: z.array(text).min(1)
  })
});

export const evidenceSchema = z.array(z.object({
  id: text,
  title: text,
  type: z.enum(["message", "image", "cctv", "document", "witness_statement", "physical", "other"]),
  summary: text,
  content: text,
  eventTime: text.optional(),
  discoveredAt: text.optional(),
  sourceDescription: text,
  relatedSuspectIds: z.array(text),
  relatedTimelineEventIds: z.array(text),
  investigatedByDefault: z.boolean().default(false)
}));

export const consistencyReviewSchema = z.object({
  uniquelySolvable: z.boolean(),
  solutionSupported: z.boolean(),
  noFatalContradictions: z.boolean(),
  allRequiredEvidencePresent: z.boolean(),
  issues: z.array(text)
});

export type MysteryPlan = z.infer<typeof planSchema>;
export type GeneratedEvidence = z.infer<typeof evidenceSchema>[number];

export function validateMystery(plan: MysteryPlan, evidence: GeneratedEvidence[], difficulty: "easy" | "medium" | "hard"): void {
  const unique = (values: string[]) => new Set(values).size === values.length;
  const suspectIds = plan.suspects.map(item => item.id);
  const evidenceIds = evidence.map(item => item.id);
  const timelineIds = plan.timeline.map(item => item.id);
  const clueIds = plan.plannedClues.map(item => item.id);
  const fail = (message: string): never => { throw new Error(`CASE_VALIDATION_FAILED: ${message}`); };

  if (!unique(suspectIds) || !unique(evidenceIds) || !unique(timelineIds) || !unique(clueIds)) fail("Generated identifiers are not unique.");
  if (suspectIds.filter(id => id === plan.solution.culpritId).length !== 1) fail("The solution culprit does not reference exactly one suspect.");
  if (evidence.length !== plan.plannedClues.length || evidence.some(item => !clueIds.includes(item.id))) fail("Evidence does not match the approved clue plan.");
  if (plan.solution.decisiveEvidenceIds.some(id => !evidenceIds.includes(id))) fail("A decisive clue is missing from the published evidence.");
  const decisiveRoles = plan.solution.decisiveEvidenceIds.map(id => plan.plannedClues.find(clue => clue.id === id)?.role);
  if (decisiveRoles.filter(role => role === "supporting" || role === "contradictory").length < 2) fail("The solution lacks two independent decisive clues.");
  if (evidence.some(item => item.relatedSuspectIds.some(id => !suspectIds.includes(id)))) fail("Evidence references a missing suspect.");
  if (evidence.some(item => item.relatedTimelineEventIds.some(id => !timelineIds.includes(id)))) fail("Evidence references a missing timeline event.");
  if (plan.timeline.some(item => item.relatedSuspectIds.some(id => !suspectIds.includes(id)) || item.relatedEvidenceIds.some(id => !evidenceIds.includes(id)))) fail("Timeline contains an invalid reference.");

  const counts = { easy: { suspects: [3, 3], evidence: [6, 8] }, medium: { suspects: [4, 4], evidence: [9, 12] }, hard: { suspects: [5, 6], evidence: [13, 18] } }[difficulty];
  if (suspectIds.length < counts.suspects[0] || suspectIds.length > counts.suspects[1]) fail(`The ${difficulty} case has an invalid suspect count.`);
  if (evidence.length < counts.evidence[0] || evidence.length > counts.evidence[1]) fail(`The ${difficulty} case has an invalid evidence count.`);
}
