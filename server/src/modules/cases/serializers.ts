export function publicSuspect(suspect: any) {
  const { privateNotes: _privateNotes, ...publicData } = suspect;
  return publicData;
}

export function publicEvidence(evidence: any) {
  const { clueRole: _clueRole, plannedPurpose: _plannedPurpose, ...publicData } = evidence;
  return publicData;
}

export function publicSuspects(caseDoc: any) {
  return (caseDoc.suspects ?? []).map((suspect: any) => ({
    ...publicSuspect(suspect),
    relevantEvidenceCount: (caseDoc.evidence ?? []).filter((item: any) => item.relatedSuspectIds?.includes(suspect.id)).length
  }));
}

export function publicCase(caseDoc: any, progress?: any) {
  return {
    id: caseDoc.id ?? String(caseDoc._id),
    title: caseDoc.title,
    scenario: caseDoc.scenario,
    category: caseDoc.category,
    difficulty: caseDoc.difficulty,
    tone: caseDoc.tone,
    caseLength: caseDoc.caseLength,
    status: caseDoc.status,
    incident: caseDoc.incident,
    suspects: publicSuspects(caseDoc),
    evidence: (caseDoc.evidence ?? []).map(publicEvidence).map(({ content: _content, ...item }: any) => item),
    timeline: caseDoc.timeline,
    progress: progress ? { investigatedEvidenceIds: progress.investigatedEvidenceIds, notes: progress.notes, accusationSubmitted: progress.accusationSubmitted } : undefined,
    createdAt: caseDoc.createdAt
  };
}
