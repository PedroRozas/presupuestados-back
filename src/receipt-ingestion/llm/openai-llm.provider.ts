import { Inject, Injectable, Optional } from '@nestjs/common';
import OpenAI from 'openai';
import { ReceiptConfigService } from '../receipt.config.js';
import type {
  LlmExtractionInput,
  LlmExtractionProvider,
  LlmExtractionResult,
  LlmImageInput,
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

const IMAGE_DETAIL = 'high';
const RESPONSE_STATUS_INCOMPLETE = 'incomplete';
const TEMPERATURE = 0;

export class LlmEmptyResponseError extends Error {
  constructor() {
    super('llm_empty_response');
    this.name = 'LlmEmptyResponseError';
  }
}

export class LlmIncompleteResponseError extends Error {
  constructor(reason: string) {
    super(`llm_incomplete_response reason=${reason}`);
    this.name = 'LlmIncompleteResponseError';
  }
}

const defaultClientFactory: OpenAiClientFactory = (apiKey) =>
  new OpenAI({ apiKey }) as unknown as OpenAiClientLike;

const toImageContent = (image: LlmImageInput) => ({
  type: 'input_image' as const,
  image_url: `data:${image.contentType};base64,${image.buffer.toString('base64')}`,
  detail: IMAGE_DETAIL,
});

@Injectable()
export class OpenAiLlmProvider implements LlmExtractionProvider {
  private readonly client: OpenAiClientLike;

  constructor(
    private readonly config: ReceiptConfigService,
    @Optional()
    @Inject(OPENAI_CLIENT_FACTORY)
    clientFactory?: OpenAiClientFactory,
  ) {
    this.client = (clientFactory ?? defaultClientFactory)(
      this.config.openAiApiKey,
    );
  }

  async extract(input: LlmExtractionInput): Promise<LlmExtractionResult> {
    const startedAt = Date.now();
    const response = await this.client.responses.create(
      this.buildParams(input),
      { timeout: input.timeoutMs },
    );
    const latencyMs = Date.now() - startedAt;

    if (response.status === RESPONSE_STATUS_INCOMPLETE) {
      throw new LlmIncompleteResponseError(
        response.incomplete_details?.reason ?? 'unknown',
      );
    }
    if (!response.output_text) {
      throw new LlmEmptyResponseError();
    }

    const usage = readOpenAiUsage(response.usage);
    return {
      rawText: response.output_text,
      model: response.model ?? this.config.extractionModel,
      tokensIn: usage.tokensIn,
      tokensOut: usage.tokensOut,
      latencyMs,
    };
  }

  private buildParams(input: LlmExtractionInput): Record<string, unknown> {
    return {
      model: this.config.extractionModel,
      instructions: input.systemPrompt,
      input: [
        {
          role: 'user',
          content: [
            { type: 'input_text', text: input.userPrompt },
            ...input.images.map(toImageContent),
          ],
        },
      ],
      max_output_tokens: input.maxOutputTokens,
      temperature: TEMPERATURE,
      store: false,
      text: {
        format: {
          type: 'json_schema',
          name: input.schemaName,
          strict: true,
          schema: input.outputJsonSchema,
        },
      },
    };
  }
}
