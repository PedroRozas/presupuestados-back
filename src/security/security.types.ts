import type { Request } from 'express';

export type RateLimitPolicy =
  | 'authLogin'
  | 'authRegister'
  | 'passwordReset'
  | 'passwordUpdate'
  | 'authRefresh'
  | 'chatbot'
  | 'ai';

export type RateLimitScope =
  | 'global'
  | 'auth_login'
  | 'auth_register'
  | 'password_reset'
  | 'password_update'
  | 'auth_refresh'
  | 'chatbot'
  | 'ai';

export type RateLimitIdentity = 'ip' | 'email' | 'ipEmail' | 'user';

export type SecurityEventType =
  | 'rate_limit_exceeded'
  | 'auth_login_failed'
  | 'auth_login_blocked'
  | 'password_reset_limited'
  | 'password_update_limited'
  | 'chatbot_rate_limited'
  | 'ai_rate_limited'
  | 'redis_unavailable';

export interface RateLimitRule {
  scope: RateLimitScope;
  routeKey: string;
  identity: RateLimitIdentity;
  windowSeconds: number;
  max: number;
  cooldownSeconds?: number;
  eventType?: SecurityEventType;
}

export interface RateLimitResult {
  allowed: boolean;
  scope: RateLimitScope;
  limit: number;
  remaining: number;
  retryAfterSeconds: number;
  resetAtUnixSeconds: number;
  key: string;
}

export interface RateLimitRequest extends Request {
  user?: {
    id: string;
    email?: string;
  };
}

export interface SecurityEventContext {
  event: SecurityEventType;
  scope?: RateLimitScope;
  method?: string;
  path?: string;
  ipHash?: string;
  emailHash?: string;
  userIdHash?: string;
  retryAfterSeconds?: number;
  redisError?: string;
}
