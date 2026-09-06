import {
  LlmEmptyResponseError,
  OpenAiLlmProvider,
  type OpenAiClientLike,
  type OpenAiResponseLike,
} from './openai-llm.provider.js';
import type { ReceiptConfigService } from '../receipt.config.js';
import type { LlmExtractionInput } from './llm.interfaces.js';

const input: LlmExtractionInput = {
  images: [{ buffer: Buffer.from('img'), contentType: 'image/webp' }],
  systemPrompt: 'sys',
  userPrompt: 'user',
  outputJsonSchema: {
    type: 'object',
    properties: {},
    required: [],
    additionalProperties: false,
  },
  schemaName: 'receipt_extraction',
  maxOutputTokens: 500,
  timeoutMs: 1000,
};

const config = {
  openAiApiKey: 'k',
  extractionModel: 'test-model',
  normalizationModel: 'small-model',
} as ReceiptConfigService;

const buildProvider = (response: OpenAiResponseLike) => {
  const create = jest.fn(() => Promise.resolve(response));
  const client: OpenAiClientLike = { responses: { create } };
  const provider = new OpenAiLlmProvider(config, () => client);
  return { provider, create };
};

describe('OpenAiLlmProvider', () => {
  it('envía system, texto e imágenes en base64 con json_schema estricto y devuelve métricas', async () => {
    const { provider, create } = buildProvider({
      output_text: '{"ok":true}',
      status: 'completed',
      usage: { input_tokens: 10, output_tokens: 5 },
      model: 'test-model-2026',
    });

    const result = await provider.extract(input);

    expect(result).toEqual(
      expect.objectContaining({
        rawText: '{"ok":true}',
        model: 'test-model-2026',
        tokensIn: 10,
        tokensOut: 5,
      }),
    );
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
    const [params, options] = create.mock.calls[0] as [
      Record<string, unknown>,
      Record<string, unknown>,
    ];
    expect(params['model']).toBe('test-model');
    expect(params['instructions']).toBe('sys');
    expect(params['max_output_tokens']).toBe(500);
    expect(params['temperature']).toBe(0);
    expect(params['store']).toBe(false);
    expect(params['text']).toEqual({
      format: {
        type: 'json_schema',
        name: 'receipt_extraction',
        strict: true,
        schema: input.outputJsonSchema,
      },
    });
    const content = (
      params['input'] as Array<{ content: Array<Record<string, unknown>> }>
    )[0]?.content;
    expect(content?.[0]).toEqual({ type: 'input_text', text: 'user' });
    expect(content?.[1]).toEqual({
      type: 'input_image',
      image_url: `data:image/webp;base64,${Buffer.from('img').toString('base64')}`,
      detail: 'high',
    });
    expect(options).toEqual({ timeout: 1000 });
  });

  it('falla con error tipado si la respuesta viene vacía', async () => {
    const { provider } = buildProvider({
      output_text: '',
      status: 'completed',
      usage: undefined,
      model: 'm',
    });
    await expect(provider.extract(input)).rejects.toBeInstanceOf(
      LlmEmptyResponseError,
    );
  });

  it('falla con error tipado si la respuesta quedó incompleta', async () => {
    const { provider } = buildProvider({
      output_text: '{"partial":',
      status: 'incomplete',
      incomplete_details: { reason: 'max_output_tokens' },
      usage: { input_tokens: 42, output_tokens: 7 },
      model: 'm',
    });
    await expect(provider.extract(input)).rejects.toThrow('max_output_tokens');
    await expect(provider.extract(input)).rejects.toMatchObject({
      usage: expect.objectContaining({
        tokensIn: 42,
        tokensOut: 7,
        model: 'm',
      }) as unknown,
    });
  });

  it('chooseCandidates usa el modelo pequeño con solo texto y json_schema estricto', async () => {
    const { provider, create } = buildProvider({
      output_text: '{"decisions":[]}',
      status: 'completed',
      usage: { input_tokens: 3, output_tokens: 1 },
      model: 'small-model-2026',
    });

    const result = await provider.chooseCandidates({
      questions: [],
      systemPrompt: 'sys-n',
      userPrompt: 'user-n',
      outputJsonSchema: {
        type: 'object',
        properties: {},
        required: [],
        additionalProperties: false,
      },
      schemaName: 'receipt_normalization',
      maxOutputTokens: 600,
      timeoutMs: 1000,
    });

    expect(result).toEqual(
      expect.objectContaining({
        rawText: '{"decisions":[]}',
        model: 'small-model-2026',
        tokensIn: 3,
        tokensOut: 1,
      }),
    );
    const [params] = create.mock.calls[0] as [Record<string, unknown>];
    expect(params['model']).toBe('small-model');
    expect(params['instructions']).toBe('sys-n');
    expect(params['max_output_tokens']).toBe(600);
    expect(params).not.toHaveProperty('temperature');
    expect(params['input']).toEqual([
      { role: 'user', content: [{ type: 'input_text', text: 'user-n' }] },
    ]);
  });
});
