import { Inject, Injectable, Optional } from '@nestjs/common';
import OpenAI from 'openai';
import { ReceiptConfigService } from '../receipt.config.js';
import type {
  LlmCallUsage,
  LlmExtractionInput,
  LlmExtractionProvider,
  LlmExtractionResult,
  LlmImageInput,
  LlmNormalizationInput,
  LlmNormalizationProvider,
  LlmNormalizationResult,
} from './llm.interfaces.js';
import { readOpenAiUsage } from './openai-usage.js';

export interface OpenAiResponseLike {
  output_text: string;
  status?: string;
  incomplete_details?: { reason?: string } | null;
  usage?: unknown;
  model?: string;
}

export interface OpenAiClientLike {
  responses: {
    create(
      params: Record<string, unknown>,
      options: { timeout: number },
    ): Promise<OpenAiResponseLike>;
  };
}

export type OpenAiClientFactory = (apiKey: string) => OpenAiClientLike;
export const OPENAI_CLIENT_FACTORY = Symbol('OPENAI_CLIENT_FACTORY');

interface BaseParamsOptions {
  model: string;
  instructions: string;
  content: unknown[];
  maxOutputTokens: number;
  schemaName: string;
  schema: Record<string, unknown>;
  temperature?: number;
  reasoningEffort?: string;
}

const IMAGE_DETAIL = 'high';
const RESPONSE_STATUS_INCOMPLETE = 'incomplete';
const OPENAI_MAX_RETRIES = 0;

export class LlmEmptyResponseError extends Error {
  constructor(public readonly usage: LlmCallUsage) {
    super('llm_empty_response');
    this.name = 'LlmEmptyResponseError';
  }
}

export class LlmIncompleteResponseError extends Error {
  constructor(
    reason: string,
    public readonly usage: LlmCallUsage,
  ) {
    super(`llm_incomplete_response reason=${reason}`);
    this.name = 'LlmIncompleteResponseError';
  }
}

const defaultClientFactory: OpenAiClientFactory = (apiKey) =>
  new OpenAI({
    apiKey,
    maxRetries: OPENAI_MAX_RETRIES,
  }) as unknown as OpenAiClientLike;

const toImageContent = (image: LlmImageInput) => ({
  type: 'input_image' as const,
  image_url: `data:${image.contentType};base64,${image.buffer.toString('base64')}`,
  detail: IMAGE_DETAIL,
});

@Injectable()
export class OpenAiLlmProvider
  implements LlmExtractionProvider, LlmNormalizationProvider
{
  private client: OpenAiClientLike | undefined;

  constructor(
    private readonly config: ReceiptConfigService,
    @Optional()
    @Inject(OPENAI_CLIENT_FACTORY)
    private readonly clientFactory?: OpenAiClientFactory,
  ) {}

  private getClient(): OpenAiClientLike {
    if (!this.client) {
      this.client = (this.clientFactory ?? defaultClientFactory)(
        this.config.openAiApiKey,
      );
    }
    return this.client;
  }

  async extract(input: LlmExtractionInput): Promise<LlmExtractionResult> {
    const content = [
      { type: 'input_text' as const, text: input.userPrompt },
      ...input.images.map(toImageContent),
    ];
    const params = this.baseParams({
      model: this.config.extractionModel,
      instructions: input.systemPrompt,
      content,
      maxOutputTokens: input.maxOutputTokens,
      schemaName: input.schemaName,
      schema: input.outputJsonSchema,
      temperature: this.config.extractionTemperature,
      reasoningEffort: this.config.extractionReasoningEffort,
    });
    return this.call(params, input.timeoutMs, this.config.extractionModel);
  }

  async chooseCandidates(
    input: LlmNormalizationInput,
  ): Promise<LlmNormalizationResult> {
    const content = [{ type: 'input_text' as const, text: input.userPrompt }];
    const params = this.baseParams({
      model: this.config.normalizationModel,
      instructions: input.systemPrompt,
      content,
      maxOutputTokens: input.maxOutputTokens,
      schemaName: input.schemaName,
      schema: input.outputJsonSchema,
      temperature: this.config.normalizationTemperature,
      reasoningEffort: this.config.normalizationReasoningEffort,
    });
    return this.call(params, input.timeoutMs, this.config.normalizationModel);
  }

  private baseParams(options: BaseParamsOptions): Record<string, unknown> {
    return {
      model: options.model,
      instructions: options.instructions,
      input: [{ role: 'user', content: options.content }],
      max_output_tokens: options.maxOutputTokens,
      ...(options.temperature === undefined
        ? {}
        : { temperature: options.temperature }),
      ...(options.reasoningEffort === undefined
        ? {}
        : { reasoning: { effort: options.reasoningEffort } }),
      store: false,
      text: {
        format: {
          type: 'json_schema',
          name: options.schemaName,
          strict: true,
          schema: options.schema,
        },
      },
    };
  }

  private async call(
    params: Record<string, unknown>,
    timeoutMs: number,
    fallbackModel: string,
  ): Promise<LlmExtractionResult> {
    const startedAt = Date.now();
    const response = await this.getClient().responses.create(params, {
      timeout: timeoutMs,
    });
    const latencyMs = Date.now() - startedAt;
    const usage = readOpenAiUsage(response.usage);
    const model = response.model ?? fallbackModel;
    const callUsage: LlmCallUsage = {
      model,
      tokensIn: usage.tokensIn,
      tokensOut: usage.tokensOut,
      latencyMs,
    };

    if (response.status === RESPONSE_STATUS_INCOMPLETE) {
      throw new LlmIncompleteResponseError(
        response.incomplete_details?.reason ?? 'unknown',
        callUsage,
      );
    }
    if (!response.output_text) {
      throw new LlmEmptyResponseError(callUsage);
    }

    return {
      rawText: response.output_text,
      model,
      tokensIn: usage.tokensIn,
      tokensOut: usage.tokensOut,
      latencyMs,
    };
  }
}
