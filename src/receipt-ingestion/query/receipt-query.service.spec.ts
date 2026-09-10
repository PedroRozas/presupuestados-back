import {
  QUERY_EMPTY_MESSAGE,
  QUERY_RATE_LIMITED_MESSAGE,
  QUERY_UNRESOLVED_MESSAGE,
  ReceiptQueryService,
} from './receipt-query.service.js';
import type { ReceiptQueryTools } from './receipt-query-tools.js';
import type {
  QueryHistoryTurn,
  ReceiptQueryHistoryStore,
} from './query-history.store.js';
import type { RedisService } from '../../security/redis.service.js';
import type { ReceiptConfigService } from '../receipt.config.js';
import type {
  LlmQueryInput,
  LlmQueryProvider,
  LlmQueryResult,
} from '../llm/llm.interfaces.js';

const llmResult = (overrides: Partial<LlmQueryResult>): LlmQueryResult => ({
  text: 'Gastaste $12.000',
  toolCallCount: 1,
  model: 'm',
  tokensIn: 10,
  tokensOut: 5,
  latencyMs: 3,
  exhausted: false,
  ...overrides,
});

const build = (
  options: {
    count?: number;
    result?: LlmQueryResult;
    history?: QueryHistoryTurn[];
  } = {},
) => {
  const tools = {
    definitions: jest.fn(() => [
      { name: 'get_month_summary', description: 'd', parametersJsonSchema: {} },
    ]),
    execute: jest.fn(() => Promise.resolve({ total: 1 })),
  };
  const redis = {
    incrementWithTtl: jest.fn(() => Promise.resolve(options.count ?? 1)),
  };
  const config = {
    queryMaxMessageChars: 20,
    queryMaxToolRounds: 3,
    queryMaxOutputTokens: 800,
    queryTimeoutMs: 1000,
    queryRateLimitWindowSeconds: 60,
    queryRateLimitMax: 10,
  } as ReceiptConfigService;
  const llm = {
    answerWithTools: jest.fn(() =>
      Promise.resolve(options.result ?? llmResult({})),
    ),
  };
  const history = {
    load: jest.fn(() => Promise.resolve(options.history ?? [])),
    append: jest.fn(() => Promise.resolve()),
  };
  const service = new ReceiptQueryService(
    tools as unknown as ReceiptQueryTools,
    redis as unknown as RedisService,
    config,
    llm as unknown as LlmQueryProvider,
    history as unknown as ReceiptQueryHistoryStore,
  );
  return { service, tools, redis, llm, history };
};

const inputOf = (llm: { answerWithTools: jest.Mock }): LlmQueryInput =>
  (llm.answerWithTools.mock.calls[0] as unknown as [LlmQueryInput])[0];

describe('ReceiptQueryService', () => {
  it('responde con el texto del modelo y delega los tools con el coupleId', async () => {
    const { service, tools, llm, redis } = build();
    const answer = await service.answer({
      coupleId: 'c1',
      threadId: 't1',
      message: '¿cuánto?',
    });

    expect(answer).toBe('Gastaste $12.000');
    expect(redis.incrementWithTtl).toHaveBeenCalledWith(
      'rl:receipts:query:c1',
      60,
    );
    const input = inputOf(llm);
    expect(input.userMessage).toContain('Pregunta: ¿cuánto?');
    expect(input.maxToolRounds).toBe(3);
    await input.executeTool({
      callId: 'x',
      name: 'get_month_summary',
      argumentsJson: '{}',
    });
    expect(tools.execute).toHaveBeenCalledWith('c1', {
      callId: 'x',
      name: 'get_month_summary',
      argumentsJson: '{}',
    });
  });

  it('recorta el mensaje al máximo configurado', async () => {
    const { service, llm } = build();
    await service.answer({
      coupleId: 'c1',
      threadId: 't1',
      message: 'x'.repeat(50),
    });
    expect(inputOf(llm).userMessage).toContain(`Pregunta: ${'x'.repeat(20)}`);
    expect(inputOf(llm).userMessage).not.toContain('x'.repeat(21));
  });

  it('rechaza cuando la pareja excede el rate limit sin llamar al modelo', async () => {
    const { service, llm } = build({ count: 11 });
    const answer = await service.answer({
      coupleId: 'c1',
      threadId: 't1',
      message: 'hola',
    });
    expect(answer).toBe(QUERY_RATE_LIMITED_MESSAGE);
    expect(llm.answerWithTools).not.toHaveBeenCalled();
  });

  it('devuelve el texto fijo cuando se agotan las rondas o la respuesta viene vacía', async () => {
    const exhausted = build({
      result: llmResult({ exhausted: true, text: '' }),
    });
    expect(
      await exhausted.service.answer({
        coupleId: 'c1',
        threadId: 't1',
        message: 'q',
      }),
    ).toBe(QUERY_UNRESOLVED_MESSAGE);
    const empty = build({ result: llmResult({ text: '  ' }) });
    expect(
      await empty.service.answer({
        coupleId: 'c1',
        threadId: 't1',
        message: 'q',
      }),
    ).toBe(QUERY_EMPTY_MESSAGE);
  });

  it('pasa al modelo el historial previo del hilo', async () => {
    const { service, llm, history } = build({
      history: [
        { role: 'user', content: '¿en qué gasté más este mes?' },
        { role: 'assistant', content: 'En lácteos, $12.000' },
      ],
    });
    await service.answer({
      coupleId: 'c1',
      threadId: 't1',
      message: 'dame el detalle',
    });
    expect(history.load).toHaveBeenCalledWith('t1');
    expect(inputOf(llm).history).toEqual([
      { role: 'user', content: '¿en qué gasté más este mes?' },
      { role: 'assistant', content: 'En lácteos, $12.000' },
    ]);
  });

  it('guarda la pregunta y la respuesta en el historial del hilo', async () => {
    const { service, history } = build();
    await service.answer({
      coupleId: 'c1',
      threadId: 't1',
      message: '¿cuánto?',
    });
    expect(history.append).toHaveBeenCalledWith('t1', [
      { role: 'user', content: '¿cuánto?' },
      { role: 'assistant', content: 'Gastaste $12.000' },
    ]);
  });

  it('no contamina el historial con respuestas de fallback', async () => {
    const limited = build({ count: 11 });
    await limited.service.answer({
      coupleId: 'c1',
      threadId: 't1',
      message: 'q',
    });
    expect(limited.history.append).not.toHaveBeenCalled();

    const exhausted = build({
      result: llmResult({ exhausted: true, text: '' }),
    });
    await exhausted.service.answer({
      coupleId: 'c1',
      threadId: 't1',
      message: 'q',
    });
    expect(exhausted.history.append).not.toHaveBeenCalled();

    const empty = build({ result: llmResult({ text: '  ' }) });
    await empty.service.answer({
      coupleId: 'c1',
      threadId: 't1',
      message: 'q',
    });
    expect(empty.history.append).not.toHaveBeenCalled();
  });

  it('responde igual aunque falle el guardado del historial', async () => {
    const { service, history } = build();
    history.append.mockRejectedValueOnce(new Error('redis caído'));
    const answer = await service.answer({
      coupleId: 'c1',
      threadId: 't1',
      message: '¿cuánto?',
    });
    expect(answer).toBe('Gastaste $12.000');
  });
});
