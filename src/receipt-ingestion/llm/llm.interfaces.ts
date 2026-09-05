export const LLM_EXTRACTION_PROVIDER = Symbol('LLM_EXTRACTION_PROVIDER');

export interface LlmImageInput {
  buffer: Buffer;
  contentType: string;
}

export interface LlmExtractionInput {
  images: LlmImageInput[];
  systemPrompt: string;
  userPrompt: string;
  outputJsonSchema: Record<string, unknown>;
  schemaName: string;
  maxOutputTokens: number;
  timeoutMs: number;
}

export interface LlmExtractionResult {
  rawText: string;
  model: string;
  tokensIn: number;
  tokensOut: number;
  latencyMs: number;
}

export interface LlmExtractionProvider {
  extract(input: LlmExtractionInput): Promise<LlmExtractionResult>;
}

export interface LlmCallUsage {
  model: string;
  tokensIn: number;
  tokensOut: number;
  latencyMs: number;
}

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

export const hasLlmUsage = (
  error: unknown,
): error is { usage: LlmCallUsage } => {
  if (typeof error !== 'object' || error === null) return false;
  const usage = (error as Record<string, unknown>)['usage'];
  if (typeof usage !== 'object' || usage === null) return false;
  const candidate = usage as Record<string, unknown>;
  return (
    typeof candidate['model'] === 'string' &&
    isFiniteNumber(candidate['tokensIn']) &&
    isFiniteNumber(candidate['tokensOut']) &&
    isFiniteNumber(candidate['latencyMs'])
  );
};

export const LLM_NORMALIZATION_PROVIDER = Symbol('LLM_NORMALIZATION_PROVIDER');

export interface NormalizationCandidate {
  id: string;
  canonicalName: string;
}

export interface NormalizationQuestion {
  key: string;
  description: string;
  candidates: NormalizationCandidate[];
}

export interface LlmNormalizationInput {
  questions: NormalizationQuestion[];
  systemPrompt: string;
  userPrompt: string;
  outputJsonSchema: Record<string, unknown>;
  schemaName: string;
  maxOutputTokens: number;
  timeoutMs: number;
}

export interface LlmNormalizationResult {
  rawText: string;
  model: string;
  tokensIn: number;
  tokensOut: number;
  latencyMs: number;
}

export interface LlmNormalizationProvider {
  chooseCandidates(
    input: LlmNormalizationInput,
  ): Promise<LlmNormalizationResult>;
}
