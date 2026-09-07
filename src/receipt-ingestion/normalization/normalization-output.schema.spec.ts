import {
  NormalizationOutputInvalidError,
  parseNormalizationOutput,
} from './normalization-output.schema.js';

describe('parseNormalizationOutput', () => {
  it('acepta decisiones con candidato o nulo', () => {
    const parsed = parseNormalizationOutput(
      JSON.stringify({
        decisions: [
          { key: 'item-1', candidate_id: 'p1' },
          { key: 'item-2', candidate_id: null },
        ],
      }),
    );
    expect(parsed.decisions).toHaveLength(2);
    expect(parsed.decisions[1]?.candidate_id).toBeNull();
  });

  it('rechaza una decisión sin key', () => {
    expect(() =>
      parseNormalizationOutput(
        JSON.stringify({ decisions: [{ candidate_id: 'p1' }] }),
      ),
    ).toThrow(NormalizationOutputInvalidError);
  });

  it('rechaza texto que no es JSON', () => {
    expect(() => parseNormalizationOutput('nope')).toThrow(
      NormalizationOutputInvalidError,
    );
  });
});
