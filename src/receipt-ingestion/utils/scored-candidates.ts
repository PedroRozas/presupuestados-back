import type { ScoredCandidate } from '../normalization/match-decision.js';

export interface CandidateRow {
  id: string;
  canonical_name: string;
  score: string | number;
}

export const toScoredCandidates = (rows: CandidateRow[]): ScoredCandidate[] =>
  rows.map((row) => ({
    id: row.id,
    canonicalName: row.canonical_name,
    score: Number(row.score),
  }));
