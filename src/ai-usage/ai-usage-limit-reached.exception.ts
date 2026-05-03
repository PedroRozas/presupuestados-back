import { ForbiddenException } from '@nestjs/common';
import type { AIUsageFeature } from './types.js';

interface AIUsageLimitReachedPayload {
  feature: AIUsageFeature;
  limit: number;
  used: number;
  periodMonth: string;
}

export class AIUsageLimitReachedException extends ForbiddenException {
  constructor(payload: AIUsageLimitReachedPayload) {
    const featureLabel =
      payload.feature === 'statement_scan' ? 'escaneos' : 'respuestas IA';

    super({
      code: 'AI_USAGE_LIMIT_REACHED',
      feature: payload.feature,
      limit: payload.limit,
      used: payload.used,
      periodMonth: payload.periodMonth,
      message: `Llegaste al límite gratuito de ${payload.limit} ${featureLabel} de este mes.`,
    });
  }
}
