import { Inject, Injectable, Logger } from '@nestjs/common';
import { RedisService } from '../../security/redis.service.js';
import {
  LLM_QUERY_PROVIDER,
  type LlmQueryProvider,
} from '../llm/llm.interfaces.js';
import { ReceiptConfigService } from '../receipt.config.js';
import {
  RECEIPT_PERIOD_TIME_ZONE,
  RECEIPT_QUERY_RATE_LIMIT_KEY_PREFIX,
} from '../receipt.constants.js';
import { QUERY_PROMPT_V1 } from './prompts/query-prompt.v1.js';
import { ReceiptQueryHistoryStore } from './query-history.store.js';
import { ReceiptQueryTools } from './receipt-query-tools.js';

export interface ReceiptQueryInput {
  coupleId: string;
  threadId: string;
  message: string;
}

export const QUERY_RATE_LIMITED_MESSAGE =
  'Por ahora llegamos al límite de consultas. Espera un minuto y seguimos.';
export const QUERY_UNRESOLVED_MESSAGE =
  'Lo siento, esta vez no pude completar la consulta. Puedes volver a intentarlo en un momento.';
export const QUERY_EMPTY_MESSAGE =
  'Esta vez no obtuve una respuesta para tu consulta. Puedes volver a intentarlo en un momento.';

const todayLabel = (now: Date): string =>
  new Intl.DateTimeFormat('es-CL', {
    dateStyle: 'full',
    timeZone: RECEIPT_PERIOD_TIME_ZONE,
  }).format(now);

@Injectable()
export class ReceiptQueryService {
  private readonly logger = new Logger(ReceiptQueryService.name);

  constructor(
    private readonly tools: ReceiptQueryTools,
    private readonly redis: RedisService,
    private readonly config: ReceiptConfigService,
    @Inject(LLM_QUERY_PROVIDER) private readonly llm: LlmQueryProvider,
    private readonly history: ReceiptQueryHistoryStore,
  ) {}

  async answer(input: ReceiptQueryInput): Promise<string> {
    if (!(await this.isWithinRateLimit(input.coupleId))) {
      this.logger.warn(`query_rate_limited couple=${input.coupleId}`);
      return QUERY_RATE_LIMITED_MESSAGE;
    }
    const message = input.message
      .trim()
      .slice(0, this.config.queryMaxMessageChars);
    const history = await this.history.load(input.threadId);
    const result = await this.llm.answerWithTools({
      systemPrompt: QUERY_PROMPT_V1.system,
      history,
      userMessage: `Hoy es ${todayLabel(new Date())}.\nPregunta: ${message}`,
      tools: this.tools.definitions(),
      executeTool: (call) => this.tools.execute(input.coupleId, call),
      maxToolRounds: this.config.queryMaxToolRounds,
      maxOutputTokens: this.config.queryMaxOutputTokens,
      timeoutMs: this.config.queryTimeoutMs,
    });
    this.logger.log(
      `query_answered couple=${input.coupleId} history=${history.length} tools=${result.toolCallCount} tokens=${result.tokensIn}/${result.tokensOut} latency=${result.latencyMs} exhausted=${result.exhausted}`,
    );
    if (result.exhausted) return QUERY_UNRESOLVED_MESSAGE;
    const answer = result.text.trim();
    if (answer.length === 0) return QUERY_EMPTY_MESSAGE;
    await this.rememberTurn(input.threadId, message, answer);
    return answer;
  }

  private async rememberTurn(
    threadId: string,
    message: string,
    answer: string,
  ): Promise<void> {
    try {
      await this.history.append(threadId, [
        { role: 'user', content: message },
        { role: 'assistant', content: answer },
      ]);
    } catch (error: unknown) {
      const reason = error instanceof Error ? error.name : 'unknown';
      this.logger.error(`query_history_append_failed reason=${reason}`);
    }
  }

  private async isWithinRateLimit(coupleId: string): Promise<boolean> {
    const count = await this.redis.incrementWithTtl(
      `${RECEIPT_QUERY_RATE_LIMIT_KEY_PREFIX}:${coupleId}`,
      this.config.queryRateLimitWindowSeconds,
    );
    return count <= this.config.queryRateLimitMax;
  }
}
