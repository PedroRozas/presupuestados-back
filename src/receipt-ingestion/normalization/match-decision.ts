export interface ScoredCandidate {
  id: string;
  canonicalName: string;
  score: number;
}

export interface MatchThresholds {
  high: number;
  low: number;
}

export type MatchDecision =
  | { kind: 'match'; id: string }
  | { kind: 'ambiguous'; candidates: ScoredCandidate[] }
  | { kind: 'new' };

export const decideMatch = (
  candidates: ScoredCandidate[],
  thresholds: MatchThresholds,
): MatchDecision => {
  const ranked = [...candidates].sort((a, b) => b.score - a.score);
  const best = ranked[0];
  if (!best || best.score < thresholds.low) return { kind: 'new' };
  if (best.score >= thresholds.high) return { kind: 'match', id: best.id };
  return {
    kind: 'ambiguous',
    candidates: ranked.filter((candidate) => candidate.score >= thresholds.low),
  };
};
