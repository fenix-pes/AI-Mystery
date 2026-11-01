import assert from "node:assert/strict";
import test from "node:test";
import { validateMystery, type GeneratedEvidence, type MysteryPlan } from "../src/modules/generation/schemas.js";
import { publicCase, publicEvidence, publicSuspect } from "../src/modules/cases/serializers.js";
import { evaluateAccusation } from "../src/modules/accusations/verdict.js";

function fixture() {
  const suspects = ["SUSPECT_01", "SUSPECT_02", "SUSPECT_03"].map((id, index) => ({
    id, name: `Suspect ${index + 1}`, occupation: "Archivist", relationshipToIncident: "Worked at the museum",
    publicBiography: "A long-serving member of the museum staff.", publicMotive: "A private disagreement.",
    publicAlibi: "Claims to have left before closing.", statement: "I did not enter the archive.", knownFacts: ["Had building access."], privateNotes: "Internal only."
  }));
  const timeline = ["EVENT_01", "EVENT_02", "EVENT_03", "EVENT_04"].map((id, index) => ({
    id, timestamp: `20:0${index}`, title: `Event ${index + 1}`, description: "A recorded event in the case timeline.",
    relatedSuspectIds: ["SUSPECT_01"], relatedEvidenceIds: [`CLUE_0${index + 1}`]
  }));
  const roles = ["supporting", "contradictory", "red_herring", "neutral", "supporting", "neutral"] as const;
  const plannedClues = roles.map((role, index) => ({ id: `CLUE_0${index + 1}`, title: `Clue ${index + 1}`, role, purpose: "Connects a fact to the timeline." }));
  const plan: MysteryPlan = {
    title: "The Missing Archive Key",
    incident: { summary: "A key disappeared from the museum archive.", incidentType: "Theft", location: "City Museum", incidentTime: "20:00", background: "A private collection was accessed." },
    suspects, timeline, plannedClues,
    solution: { culpritId: "SUSPECT_01", motive: "Protect a hidden family record.", method: "Used a copied key.", reconstruction: "The archive was entered after closing.", decisiveEvidenceIds: ["CLUE_01", "CLUE_02"], redHerringExplanations: ["The muddy print came from a delivery worker."] }
  };
  const evidence: GeneratedEvidence[] = plannedClues.map((clue, index) => ({
    id: clue.id, title: clue.title, type: "document", summary: "A record from the museum.", content: "The entry log records an after-hours visit.",
    sourceDescription: "Archive entry log", relatedSuspectIds: ["SUSPECT_01"], relatedTimelineEventIds: [`EVENT_0${Math.min(index + 1, 4)}`], investigatedByDefault: false
  }));
  return { plan, evidence };
}

test("mystery validation accepts a complete easy case with two decisive clues", () => {
  const { plan, evidence } = fixture();
  assert.doesNotThrow(() => validateMystery(plan, evidence, "easy"));
});

test("mystery validation rejects missing planned evidence", () => {
  const { plan, evidence } = fixture();
  assert.throws(() => validateMystery(plan, evidence.slice(1), "easy"), /Evidence does not match/);
});

test("mystery validation rejects a culprit ID that does not resolve to a suspect", () => {
  const { plan, evidence } = fixture();
  plan.solution.culpritId = "SUSPECT_99";
  assert.throws(() => validateMystery(plan, evidence, "easy"), /does not reference exactly one suspect/);
});

test("mystery validation rejects dangling suspect references", () => {
  const { plan, evidence } = fixture();
  evidence[0]!.relatedSuspectIds = ["SUSPECT_MISSING"];
  assert.throws(() => validateMystery(plan, evidence, "easy"), /missing suspect/);
});

test("mystery validation rejects duplicate identifiers", () => {
  const { plan, evidence } = fixture();
  evidence[1]!.id = evidence[0]!.id;
  assert.throws(() => validateMystery(plan, evidence, "easy"), /not unique/);
});

test("public suspect serialization omits internal notes", () => {
  const result = publicSuspect({ id: "SUSPECT_01", name: "A. Example", privateNotes: "Canonical culprit" });
  assert.equal(result.name, "A. Example");
  assert.equal("privateNotes" in result, false);
});

test("public evidence serialization omits clue roles and validation purpose", () => {
  const result = publicEvidence({ id: "CLUE_01", title: "Entry log", clueRole: "supporting", plannedPurpose: "Proves the alibi false" });
  assert.deepEqual(result, { id: "CLUE_01", title: "Entry log" });
});

test("public case serialization handles lean IDs and never includes the solution", () => {
  const result = publicCase({ _id: "case-1", title: "Case", solution: { culpritId: "secret" }, suspects: [], evidence: [], timeline: [] });
  assert.equal(result.id, "case-1");
  assert.equal("solution" in result, false);
});

test("the server verdict matches only the fixed culprit ID", () => {
  assert.equal(evaluateAccusation("SUSPECT_01", "SUSPECT_01"), "correct");
  assert.equal(evaluateAccusation("SUSPECT_02", "SUSPECT_01"), "incorrect");
});
