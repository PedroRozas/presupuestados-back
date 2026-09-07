import {
  OpenAiLlmProvider,
  type OpenAiClientLike,
  type OpenAiResponseLike,
} from './openai-llm.provider.js';
import type { ReceiptConfigService } from '../receipt.config.js';
import type { LlmQueryInput, LlmToolCall } from './llm.interfaces.js';

const config = {
  openAiApiKey: 'k',
  queryModel: 'query-model',
  queryTemperature: 0,
  queryReasoningEffort: undefined,
} as ReceiptConfigService;

const functionCall = (callId: string, args: string) => ({
  type: 'function_call',
  call_id: callId,
  name: 'get_month_summary',
  arguments: args,
});

const textResponse = (text: string): OpenAiResponseLike => ({
  output_text: text,
  output: [{ type: 'message', content: [] }],
  usage: { input_tokens: 10, output_tokens: 5 },
  model: 'query-model-2026',
});

const toolResponse = (callId: string): OpenAiResponseLike => ({
  output_text: '',
  output: [functionCall(callId, '{"year":2026,"month":9}')],
  usage: { input_tokens: 20, output_tokens: 8 },
});

const buildProvider = (responses: OpenAiResponseLike[]) => {
  const queue = [...responses];
  const create = jest.fn(() =>
    Promise.resolve(queue.shift() ?? textResponse('')),
  );
  const client: OpenAiClientLike = { responses: { create } };
  const provider = new OpenAiLlmProvider(config, () => client);
  return { provider, create };
};

const buildInput = (
  executeTool: jest.Mock<Promise<unknown>, [LlmToolCall]>,
  maxToolRounds = 3,
): LlmQueryInput => ({
  systemPrompt: 'sys',
  userMessage: '¿cuánto gasté?',
  tools: [
    {
      name: 'get_month_summary',
      description: 'resumen',
      parametersJsonSchema: {
        type: 'object',
        properties: {},
        required: [],
        additionalProperties: false,
      },
    },
  ],
  executeTool,
  maxToolRounds,
  maxOutputTokens: 800,
  timeoutMs: 1000,
});

const paramsOfCall = (create: jest.Mock, index: number) =>
  create.mock.calls[index] as unknown as [
    Record<string, unknown>,
    { timeout: number },
  ];

describe('OpenAiLlmProvider.answerWithTools', () => {
  it('sin tool calls devuelve el texto en una sola ronda con tools estrictas y sin paralelismo', async () => {
    const { provider, create } = buildProvider([
      textResponse('Gastaste $12.000'),
    ]);
    const executeTool = jest.fn<Promise<unknown>, [LlmToolCall]>();

    const result = await provider.answerWithTools(buildInput(executeTool));

    expect(result).toEqual(
      expect.objectContaining({
        text: 'Gastaste $12.000',
        toolCallCount: 0,
        model: 'query-model-2026',
        tokensIn: 10,
        tokensOut: 5,
        exhausted: false,
      }),
    );
    expect(executeTool).not.toHaveBeenCalled();
    const [params, options] = paramsOfCall(create, 0);
    expect(params['model']).toBe('query-model');
    expect(params['instructions']).toBe('sys');
    expect(params['parallel_tool_calls']).toBe(false);
    expect(params['tool_choice']).toBe('auto');
    expect(params['store']).toBe(false);
    expect(params['temperature']).toBe(0);
    expect(params['max_output_tokens']).toBe(800);
    expect(params['tools']).toEqual([
      expect.objectContaining({
        type: 'function',
        name: 'get_month_summary',
        strict: true,
      }),
    ]);
    expect(options.timeout).toBe(1000);
  });

  it('ejecuta la tool y reenvía function_call_output en la segunda llamada acumulando tokens', async () => {
    const { provider, create } = buildProvider([
      toolResponse('call_1'),
      textResponse('Listo'),
    ]);
    const executeTool = jest
      .fn<Promise<unknown>, [LlmToolCall]>()
      .mockResolvedValue({ total: 12000 });

    const result = await provider.answerWithTools(buildInput(executeTool));

    expect(executeTool).toHaveBeenCalledWith({
      callId: 'call_1',
      name: 'get_month_summary',
      argumentsJson: '{"year":2026,"month":9}',
    });
    const [secondParams] = paramsOfCall(create, 1);
    const input = secondParams['input'] as unknown[];
    expect(input).toHaveLength(3);
    expect(input[1]).toEqual(functionCall('call_1', '{"year":2026,"month":9}'));
    expect(input[2]).toEqual({
      type: 'function_call_output',
      call_id: 'call_1',
      output: '{"total":12000}',
    });
    expect(result.text).toBe('Listo');
    expect(result.toolCallCount).toBe(1);
    expect(result.tokensIn).toBe(30);
    expect(result.tokensOut).toBe(13);
    expect(result.exhausted).toBe(false);
  });

  it('marca exhausted cuando la respuesta viene incomplete por falta de tokens', async () => {
    const { provider } = buildProvider([
      {
        ...textResponse('Gastaste $1'),
        status: 'incomplete',
        incomplete_details: { reason: 'max_output_tokens' },
      },
    ]);
    const executeTool = jest.fn<Promise<unknown>, [LlmToolCall]>();
    const result = await provider.answerWithTools(buildInput(executeTool));
    expect(result.exhausted).toBe(true);
    expect(result.text).toBe('');
  });

  it('reenvía solo los items function_call, no el razonamiento', async () => {
    const withReasoning: OpenAiResponseLike = {
      ...toolResponse('call_r'),
      output: [
        { type: 'reasoning', summary: [] },
        functionCall('call_r', '{}'),
      ],
    };
    const { provider, create } = buildProvider([
      withReasoning,
      textResponse('ok'),
    ]);
    const executeTool = jest
      .fn<Promise<unknown>, [LlmToolCall]>()
      .mockResolvedValue({});
    await provider.answerWithTools(buildInput(executeTool));
    const [secondParams] = paramsOfCall(create, 1);
    const input = secondParams['input'] as { type?: string }[];
    expect(input.map((item) => item.type)).toEqual([
      undefined,
      'function_call',
      'function_call_output',
    ]);
  });

  it('corta con exhausted cuando el modelo sigue pidiendo tools tras el máximo de rondas', async () => {
    const { provider, create } = buildProvider([
      toolResponse('c1'),
      toolResponse('c2'),
      toolResponse('c3'),
    ]);
    const executeTool = jest
      .fn<Promise<unknown>, [LlmToolCall]>()
      .mockResolvedValue({});

    const result = await provider.answerWithTools(buildInput(executeTool, 2));

    expect(create).toHaveBeenCalledTimes(3);
    expect(executeTool).toHaveBeenCalledTimes(2);
    expect(result.exhausted).toBe(true);
    expect(result.text).toBe('');
    expect(result.toolCallCount).toBe(2);
  });
});
