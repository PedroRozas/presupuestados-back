import { Injectable, Logger } from '@nestjs/common';
import { z } from 'zod';
import { detectPromptInjection } from '../../common/utils/prompt-injection.js';
import { RedisService } from '../../security/redis.service.js';
import { ReceiptConfigService } from '../receipt.config.js';
import { RECEIPT_QUERY_HISTORY_KEY_PREFIX } from '../receipt.constants.js';

const historyTurnSchema = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.string().min(1),
});

const historySchema = z.array(historyTurnSchema);

export type QueryHistoryTurn = z.infer<typeof historyTurnSchema>;

@Injectable()
export class ReceiptQueryHistoryStore {
  private readonly logger = new Logger(ReceiptQueryHistoryStore.name);

  constructor(
    private readonly redis: RedisService,
    private readonly config: ReceiptConfigService,
  ) {}

  async load(threadId: string): Promise<QueryHistoryTurn[]> {
    const raw = await this.redis.getValue(this.keyFor(threadId));
    if (raw === null) return [];
    const parsed = historySchema.safeParse(this.parseJson(raw));
    if (!parsed.success) {
      this.logger.warn('query_history_discarded reason=invalid_payload');
      return [];
    }
    return parsed.data.filter((turn) => {
      const injection = detectPromptInjection(turn.content);
      if (injection === null) return true;
      this.logger.warn(`query_history_turn_dropped reason=${injection.reason}`);
      return false;
    });
  }

  async append(threadId: string, turns: QueryHistoryTurn[]): Promise<void> {
    const injection = turns
      .map((turn) => detectPromptInjection(turn.content))
      .find((match) => match !== null);
    if (injection) {
      this.logger.warn(
        `query_history_exchange_rejected reason=${injection.reason}`,
      );
      return;
    }
    const previous = await this.load(threadId);
    const next = [...previous, ...turns.map((turn) => this.truncate(turn))]
      .filter((turn) => turn.content.length > 0)
      .slice(-this.config.queryHistoryMaxTurns);
    await this.redis.setValueWithTtl(
      this.keyFor(threadId),
      JSON.stringify(next),
      this.config.queryHistoryTtlSeconds,
    );
  }

  private truncate(turn: QueryHistoryTurn): QueryHistoryTurn {
    return {
      role: turn.role,
      content: turn.content
        .trim()
        .slice(0, this.config.queryHistoryMaxTurnChars),
    };
  }

  private keyFor(threadId: string): string {
    return `${RECEIPT_QUERY_HISTORY_KEY_PREFIX}:${threadId}`;
  }

  private parseJson(raw: string): unknown {
    try {
      return JSON.parse(raw) as unknown;
    } catch {
      this.logger.warn('query_history_discarded reason=invalid_json');
      return null;
    }
  }
}
