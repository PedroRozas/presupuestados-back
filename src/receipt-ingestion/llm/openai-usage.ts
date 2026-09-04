export interface TokenUsage {
  tokensIn: number;
  tokensOut: number;
}

const readNumber = (source: Record<string, unknown>, key: string): number => {
  const value = source[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
};

export const readOpenAiUsage = (usage: unknown): TokenUsage => {
  if (typeof usage !== 'object' || usage === null) {
    return { tokensIn: 0, tokensOut: 0 };
  }
  const source = usage as Record<string, unknown>;
  return {
    tokensIn: readNumber(source, 'input_tokens'),
    tokensOut: readNumber(source, 'output_tokens'),
  };
};
