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
import { ReceiptQueryTools } from './receipt-query-tools.js';

export interface ReceiptQueryInput {
  coupleId: string;
  message: string;
}

export const QUERY_RATE_LIMITED_MESSAGE =
  'Demasiadas consultas, intenta en un minuto.';
export const QUERY_UNRESOLVED_MESSAGE =
  'No pude resolver la consulta. Intenta preguntarlo de otra forma.';
export const QUERY_EMPTY_MESSAGE =
  'No encontré información para responder eso.';

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
  ) {}

  async answer(input: ReceiptQueryInput): Promise<string> {
    if (!(await this.isWithinRateLimit(input.coupleId))) {
      this.logger.warn(`query_rate_limited couple=${input.coupleId}`);
      return QUERY_RATE_LIMITED_MESSAGE;
    }
    const message = input.message
      .trim()
      .slice(0, this.config.queryMaxMessageChars);
    const result = await this.llm.answerWithTools({
      systemPrompt: QUERY_PROMPT_V1.system,
      userMessage: `Hoy es ${todayLabel(new Date())}.\nPregunta: ${message}`,
      tools: this.tools.definitions(),
      executeTool: (call) => this.tools.execute(input.coupleId, call),
      maxToolRounds: this.config.queryMaxToolRounds,
      maxOutputTokens: this.config.queryMaxOutputTokens,
      timeoutMs: this.config.queryTimeoutMs,
    });
    this.logger.log(
      `query_answered couple=${input.coupleId} tools=${result.toolCallCount} tokens=${result.tokensIn}/${result.tokensOut} latency=${result.latencyMs} exhausted=${result.exhausted}`,
    );
    if (result.exhausted) return QUERY_UNRESOLVED_MESSAGE;
    return result.text.trim() || QUERY_EMPTY_MESSAGE;
  }

  private async isWithinRateLimit(coupleId: string): Promise<boolean> {
    const count = await this.redis.incrementWithTtl(
      `${RECEIPT_QUERY_RATE_LIMIT_KEY_PREFIX}:${coupleId}`,
      this.config.queryRateLimitWindowSeconds,
    );
    return count <= this.config.queryRateLimitMax;
  }
}
