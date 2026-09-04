import { readOpenAiUsage } from './openai-usage.js';

describe('readOpenAiUsage', () => {
  it('lee input y output tokens', () => {
    expect(readOpenAiUsage({ input_tokens: 1200, output_tokens: 340 })).toEqual(
      {
        tokensIn: 1200,
        tokensOut: 340,
      },
    );
  });

  it('devuelve ceros si no hay uso', () => {
    expect(readOpenAiUsage(undefined)).toEqual({ tokensIn: 0, tokensOut: 0 });
  });

  it('ignora valores no numéricos', () => {
    expect(readOpenAiUsage({ input_tokens: 'x', output_tokens: null })).toEqual(
      {
        tokensIn: 0,
        tokensOut: 0,
      },
    );
  });
});
