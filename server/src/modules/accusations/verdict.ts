export type Verdict = "correct" | "incorrect";

export function evaluateAccusation(selectedSuspectId: string, canonicalCulpritId: string): Verdict {
  return selectedSuspectId === canonicalCulpritId ? "correct" : "incorrect";
}
