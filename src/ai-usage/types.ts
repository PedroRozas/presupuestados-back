import { AI_USAGE_LIMITS } from './ai-usage.constants.js';

export type AIUsageFeature = keyof typeof AI_USAGE_LIMITS;

export interface AIUsageStatusItem {
  feature: AIUsageFeature;
  used: number;
  limit: number;
  remaining: number;
  isPremium: boolean;
  periodMonth: string;
}

export type AIUsageStatusResponse = Record<AIUsageFeature, AIUsageStatusItem>;
