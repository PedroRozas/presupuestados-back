import {
  Inject,
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { eq, and, sql } from 'drizzle-orm';
import { DRIZZLE } from '../database/database.module.js';
import * as schema from '../database/schema/index.js';
import { aiUsageMonthly, profiles } from '../database/schema/index.js';
import { AI_USAGE_LIMITS } from './ai-usage.constants.js';
import { AIUsageLimitReachedException } from './ai-usage-limit-reached.exception.js';
import type {
  AIUsagePublicStatusItem,
  AIUsagePublicStatusResponse,
  AIUsageFeature,
  AIUsageStatusItem,
  AIUsageStatusResponse,
} from './types.js';

@Injectable()
export class AIUsageService {
  private readonly logger = new Logger(AIUsageService.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: NodePgDatabase<typeof schema>,
  ) {}

  getCurrentPeriodMonth() {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Santiago',
      year: 'numeric',
      month: '2-digit',
    }).formatToParts(new Date());

    const year = parts.find((part) => part.type === 'year')?.value;
    const month = parts.find((part) => part.type === 'month')?.value;

    if (!year || !month) {
      throw new InternalServerErrorException('Error calculando periodo de IA');
    }

    return `${year}-${month}-01`;
  }

  async getStatusForUser(userId: string): Promise<AIUsageStatusResponse> {
    const profile = await this.getProfile(userId);
    return this.getStatusItems(userId, Boolean(profile.isPremium));
  }

  async getPublicStatusForUser(
    userId: string,
  ): Promise<AIUsagePublicStatusResponse> {
    return this.toPublicStatusResponse(await this.getStatusForUser(userId));
  }

  toPublicStatusItem(item: AIUsageStatusItem): AIUsagePublicStatusItem {
    return {
      used: item.used,
      limit: item.limit,
      remaining: item.remaining,
      isPremium: item.isPremium,
    };
  }

  toPublicStatusResponse(
    status: AIUsageStatusResponse,
  ): AIUsagePublicStatusResponse {
    return {
      statement_scan: this.toPublicStatusItem(status.statement_scan),
      chatbot_response: this.toPublicStatusItem(status.chatbot_response),
    };
  }

  async reserveUsage(
    userId: string,
    feature: AIUsageFeature,
    isPremium: boolean,
  ): Promise<AIUsageStatusItem> {
    const periodMonth = this.getCurrentPeriodMonth();

    if (isPremium) {
      return this.getFeatureStatus(userId, feature, true, periodMonth);
    }

    const limit = AI_USAGE_LIMITS[feature];
    const result = await this.db.execute(sql`
      insert into ai_usage_monthly (user_id, feature, period_month, usage_count)
      values (${userId}, ${feature}, ${periodMonth}, 1)
      on conflict (user_id, feature, period_month)
      do update set
        usage_count = ai_usage_monthly.usage_count + 1,
        updated_at = now()
      where ai_usage_monthly.usage_count < ${limit}
      returning usage_count
    `);
    const rows = (result as unknown as { rows: { usage_count: number }[] })
      .rows;
    const row = rows[0];

    if (!row) {
      const current = await this.getFeatureStatus(
        userId,
        feature,
        false,
        periodMonth,
      );
      this.logger.warn(
        `ai_usage_limit_reached userId=${userId} feature=${feature} periodMonth=${periodMonth} used=${current.used} limit=${limit}`,
      );
      throw new AIUsageLimitReachedException({
        feature,
        limit,
        used: current.used,
        periodMonth,
      });
    }

    const used = Number(row.usage_count);
    this.logger.log(
      `ai_usage_reserved userId=${userId} feature=${feature} periodMonth=${periodMonth} used=${used} limit=${limit}`,
    );

    return this.buildStatusItem(feature, used, false, periodMonth);
  }

  async refundUsage(
    userId: string,
    feature: AIUsageFeature,
    periodMonth: string,
  ) {
    await this.db
      .update(aiUsageMonthly)
      .set({
        usageCount: sql`greatest(${aiUsageMonthly.usageCount} - 1, 0)`,
        updatedAt: sql`now()`,
      })
      .where(
        and(
          eq(aiUsageMonthly.userId, userId),
          eq(aiUsageMonthly.feature, feature),
          eq(aiUsageMonthly.periodMonth, periodMonth),
        ),
      );

    this.logger.log(
      `ai_usage_refunded userId=${userId} feature=${feature} periodMonth=${periodMonth}`,
    );
  }

  private async getProfile(userId: string) {
    const result = await this.db
      .select({ isPremium: profiles.isPremium })
      .from(profiles)
      .where(eq(profiles.id, userId))
      .limit(1);

    const profile = result[0];
    if (!profile) {
      throw new InternalServerErrorException(
        'Error al obtener perfil del usuario',
      );
    }

    return profile;
  }

  private async getStatusItems(
    userId: string,
    isPremium: boolean,
  ): Promise<AIUsageStatusResponse> {
    const periodMonth = this.getCurrentPeriodMonth();
    const rows = await this.db
      .select({
        feature: aiUsageMonthly.feature,
        usageCount: aiUsageMonthly.usageCount,
      })
      .from(aiUsageMonthly)
      .where(
        and(
          eq(aiUsageMonthly.userId, userId),
          eq(aiUsageMonthly.periodMonth, periodMonth),
        ),
      );

    const usedByFeature = new Map<AIUsageFeature, number>(
      rows.map((row) => [row.feature, row.usageCount]),
    );

    return {
      statement_scan: this.buildStatusItem(
        'statement_scan',
        usedByFeature.get('statement_scan') ?? 0,
        isPremium,
        periodMonth,
      ),
      chatbot_response: this.buildStatusItem(
        'chatbot_response',
        usedByFeature.get('chatbot_response') ?? 0,
        isPremium,
        periodMonth,
      ),
    };
  }

  private async getFeatureStatus(
    userId: string,
    feature: AIUsageFeature,
    isPremium: boolean,
    periodMonth: string,
  ) {
    const rows = await this.db
      .select({ usageCount: aiUsageMonthly.usageCount })
      .from(aiUsageMonthly)
      .where(
        and(
          eq(aiUsageMonthly.userId, userId),
          eq(aiUsageMonthly.feature, feature),
          eq(aiUsageMonthly.periodMonth, periodMonth),
        ),
      )
      .limit(1);

    return this.buildStatusItem(
      feature,
      rows[0]?.usageCount ?? 0,
      isPremium,
      periodMonth,
    );
  }

  private buildStatusItem(
    feature: AIUsageFeature,
    used: number,
    isPremium: boolean,
    periodMonth: string,
  ): AIUsageStatusItem {
    const limit = AI_USAGE_LIMITS[feature];

    return {
      feature,
      used,
      limit,
      remaining: Math.max(limit - used, 0),
      isPremium,
      periodMonth,
    };
  }
}
