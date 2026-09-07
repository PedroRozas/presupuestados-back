import { decideMatch } from './match-decision.js';

const thresholds = { high: 0.6, low: 0.3 };
const c = (id: string, score: number) => ({
  id,
  canonicalName: id.toUpperCase(),
  score,
});

describe('decideMatch', () => {
  it('hace match directo con el mejor candidato sobre el umbral alto', () => {
    expect(decideMatch([c('b', 0.5), c('a', 0.9)], thresholds)).toEqual({
      kind: 'match',
      id: 'a',
    });
  });

  it('marca ambiguo con los candidatos sobre el umbral bajo, ordenados por score', () => {
    expect(
      decideMatch([c('a', 0.35), c('b', 0.55), c('c', 0.1)], thresholds),
    ).toEqual({
      kind: 'ambiguous',
      candidates: [c('b', 0.55), c('a', 0.35)],
    });
  });

  it('crea nuevo si nadie alcanza el umbral bajo', () => {
    expect(decideMatch([c('a', 0.2)], thresholds)).toEqual({ kind: 'new' });
  });

  it('crea nuevo sin candidatos', () => {
    expect(decideMatch([], thresholds)).toEqual({ kind: 'new' });
  });

  it('trata el umbral alto como inclusivo', () => {
    expect(decideMatch([c('a', 0.6)], thresholds)).toEqual({
      kind: 'match',
      id: 'a',
    });
  });
});
