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
