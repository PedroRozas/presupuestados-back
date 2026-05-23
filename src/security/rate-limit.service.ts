import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'node:crypto';
import { DEFAULT_RATE_LIMITS } from './security.constants.js';
import { RedisService } from './redis.service.js';
import { SecurityEventsService } from './security-events.service.js';
import type {
  RateLimitIdentity,
  RateLimitPolicy,
  RateLimitRequest,
  RateLimitResult,
  RateLimitRule,
} from './security.types.js';

@Injectable()
export class RateLimitService {
  private readonly logger = new Logger(RateLimitService.name);
  private readonly hashSalt: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly redisService: RedisService,
    private readonly securityEventsService: SecurityEventsService,
  ) {
    const configuredSalt = this.configService.get<string>(
      'RATE_LIMIT_HASH_SALT',
    );
    const isProduction =
      this.configService.get<string>('NODE_ENV') === 'production';

    if (isProduction && !configuredSalt) {
      throw new Error(
        'RATE_LIMIT_HASH_SALT es obligatorio en producción. Configurar antes de iniciar el servicio.',
      );
    }

    this.hashSalt = configuredSalt ?? 'presupuestados-dev-rate-limit-salt';
  }

  async checkGlobalLimit(request: RateLimitRequest): Promise<RateLimitResult> {
    return this.checkRules(request, [
      {
        scope: 'global',
        routeKey: 'global',
        identity: 'ip',
        windowSeconds: this.getNumber(
          'RATE_LIMIT_GLOBAL_WINDOW_SECONDS',
          DEFAULT_RATE_LIMITS.globalWindowSeconds,
        ),
        max: this.getNumber(
          'RATE_LIMIT_GLOBAL_MAX',
          DEFAULT_RATE_LIMITS.globalMax,
        ),
        eventType: 'rate_limit_exceeded',
      },
    ]);
  }

  async checkPolicy(
    policy: RateLimitPolicy,
    request: RateLimitRequest,
  ): Promise<RateLimitResult> {
    return this.checkRules(request, this.getPolicyRules(policy));
  }

  hashIdentifier(value: string): string {
    return createHash('sha256')
      .update(this.hashSalt)
      .update(':')
      .update(value.trim().toLowerCase())
      .digest('hex')
      .slice(0, 32);
  }

  private async checkRules(
    request: RateLimitRequest,
    rules: RateLimitRule[],
  ): Promise<RateLimitResult> {
    try {
      let selectedResult: RateLimitResult | undefined;

      for (const rule of rules) {
        const result = await this.checkRule(request, rule);

        if (!result.allowed) {
          return result;
        }

        if (
          !selectedResult ||
          result.remaining / result.limit <
            selectedResult.remaining / selectedResult.limit
        ) {
          selectedResult = result;
        }
      }

      if (!selectedResult) {
        throw new Error('No hay reglas de rate limit configuradas');
      }

      return selectedResult;
    } catch (error) {
      this.securityEventsService.logRedisUnavailable(error);
      return this.getFailOpenResult(rules[0]);
    }
  }

  private async checkRule(
    request: RateLimitRequest,
    rule: RateLimitRule,
  ): Promise<RateLimitResult> {
    const identifier = this.getIdentifier(request, rule.identity);
    const key = this.buildRateLimitKey(
      rule.routeKey,
      rule.identity,
      identifier,
    );
    const cooldownKey = `cooldown:${key}`;

    if (rule.cooldownSeconds && (await this.redisService.exists(cooldownKey))) {
      const retryAfterSeconds = await this.redisService.getTtl(cooldownKey);
      return {
        allowed: false,
        scope: rule.scope,
        limit: rule.max,
        remaining: 0,
        retryAfterSeconds,
        resetAtUnixSeconds: this.getResetAtUnixSeconds(retryAfterSeconds),
        key,
      };
    }

    const count = await this.redisService.incrementWithTtl(
      key,
      rule.windowSeconds,
    );
    const ttlSeconds = await this.redisService.getTtl(key);
    const retryAfterSeconds = ttlSeconds > 0 ? ttlSeconds : rule.windowSeconds;

    if (count > rule.max) {
      if (rule.cooldownSeconds) {
        await this.redisService.setCooldown(cooldownKey, rule.cooldownSeconds);
      }

      return {
        allowed: false,
        scope: rule.scope,
        limit: rule.max,
        remaining: 0,
        retryAfterSeconds: rule.cooldownSeconds ?? retryAfterSeconds,
        resetAtUnixSeconds: this.getResetAtUnixSeconds(
          rule.cooldownSeconds ?? retryAfterSeconds,
        ),
        key,
      };
    }

    return {
      allowed: true,
      scope: rule.scope,
      limit: rule.max,
      remaining: Math.max(rule.max - count, 0),
      retryAfterSeconds,
      resetAtUnixSeconds: this.getResetAtUnixSeconds(retryAfterSeconds),
      key,
    };
  }

  private getPolicyRules(policy: RateLimitPolicy): RateLimitRule[] {
    switch (policy) {
      case 'authLogin':
        return [
          {
            scope: 'auth_login',
            routeKey: 'auth:login',
            identity: 'ip',
            windowSeconds: this.getNumber(
              'RATE_LIMIT_AUTH_WINDOW_SECONDS',
              DEFAULT_RATE_LIMITS.authWindowSeconds,
            ),
            max: this.getNumber(
              'RATE_LIMIT_AUTH_MAX',
              DEFAULT_RATE_LIMITS.authIpMax,
            ),
            cooldownSeconds: this.getNumber(
              'RATE_LIMIT_AUTH_COOLDOWN_SECONDS',
              DEFAULT_RATE_LIMITS.authWindowSeconds,
            ),
            eventType: 'auth_login_blocked',
          },
          {
            scope: 'auth_login',
            routeKey: 'auth:login',
            identity: 'email',
            windowSeconds: this.getNumber(
              'RATE_LIMIT_AUTH_WINDOW_SECONDS',
              DEFAULT_RATE_LIMITS.authWindowSeconds,
            ),
            max: this.getNumber(
              'RATE_LIMIT_AUTH_EMAIL_MAX',
              DEFAULT_RATE_LIMITS.authEmailMax,
            ),
            cooldownSeconds: this.getNumber(
              'RATE_LIMIT_AUTH_COOLDOWN_SECONDS',
              DEFAULT_RATE_LIMITS.authWindowSeconds,
            ),
            eventType: 'auth_login_blocked',
          },
          {
            scope: 'auth_login',
            routeKey: 'auth:login',
            identity: 'ipEmail',
            windowSeconds: this.getNumber(
              'RATE_LIMIT_AUTH_WINDOW_SECONDS',
              DEFAULT_RATE_LIMITS.authWindowSeconds,
            ),
            max: this.getNumber(
              'RATE_LIMIT_AUTH_COMBO_MAX',
              DEFAULT_RATE_LIMITS.authComboMax,
            ),
            cooldownSeconds: this.getNumber(
              'RATE_LIMIT_AUTH_COOLDOWN_SECONDS',
              DEFAULT_RATE_LIMITS.authWindowSeconds,
            ),
            eventType: 'auth_login_blocked',
          },
        ];
      case 'authRegister':
        return [
          {
            scope: 'auth_register',
            routeKey: 'auth:register',
            identity: 'ip',
            windowSeconds: this.getNumber(
              'RATE_LIMIT_REGISTER_WINDOW_SECONDS',
              DEFAULT_RATE_LIMITS.registerWindowSeconds,
            ),
            max: this.getNumber(
              'RATE_LIMIT_REGISTER_IP_MAX',
              DEFAULT_RATE_LIMITS.registerIpMax,
            ),
            eventType: 'rate_limit_exceeded',
          },
          {
            scope: 'auth_register',
            routeKey: 'auth:register',
            identity: 'email',
            windowSeconds: this.getNumber(
              'RATE_LIMIT_REGISTER_WINDOW_SECONDS',
              DEFAULT_RATE_LIMITS.registerWindowSeconds,
            ),
            max: this.getNumber(
              'RATE_LIMIT_REGISTER_EMAIL_MAX',
              DEFAULT_RATE_LIMITS.registerEmailMax,
            ),
            eventType: 'rate_limit_exceeded',
          },
        ];
      case 'passwordReset':
        return [
          {
            scope: 'password_reset',
            routeKey: 'auth:forgot-password',
            identity: 'ip',
            windowSeconds: this.getNumber(
              'RATE_LIMIT_PASSWORD_RESET_WINDOW_SECONDS',
              DEFAULT_RATE_LIMITS.passwordResetWindowSeconds,
            ),
            max: this.getNumber(
              'RATE_LIMIT_PASSWORD_RESET_MAX',
              DEFAULT_RATE_LIMITS.passwordResetIpMax,
            ),
            eventType: 'password_reset_limited',
          },
          {
            scope: 'password_reset',
            routeKey: 'auth:forgot-password',
            identity: 'email',
            windowSeconds: this.getNumber(
              'RATE_LIMIT_PASSWORD_RESET_WINDOW_SECONDS',
              DEFAULT_RATE_LIMITS.passwordResetWindowSeconds,
            ),
            max: this.getNumber(
              'RATE_LIMIT_PASSWORD_RESET_EMAIL_MAX',
              DEFAULT_RATE_LIMITS.passwordResetEmailMax,
            ),
            eventType: 'password_reset_limited',
          },
        ];
      case 'passwordUpdate':
        return [
          {
            scope: 'password_update',
            routeKey: 'auth:update-password',
            identity: 'user',
            windowSeconds: this.getNumber(
              'RATE_LIMIT_PASSWORD_UPDATE_WINDOW_SECONDS',
              DEFAULT_RATE_LIMITS.passwordUpdateWindowSeconds,
            ),
            max: this.getNumber(
              'RATE_LIMIT_PASSWORD_UPDATE_USER_MAX',
              DEFAULT_RATE_LIMITS.passwordUpdateUserMax,
            ),
            cooldownSeconds: this.getNumber(
              'RATE_LIMIT_PASSWORD_UPDATE_COOLDOWN_SECONDS',
              DEFAULT_RATE_LIMITS.passwordUpdateWindowSeconds,
            ),
            eventType: 'password_update_limited',
          },
          {
            scope: 'password_update',
            routeKey: 'auth:update-password',
            identity: 'ip',
            windowSeconds: this.getNumber(
              'RATE_LIMIT_PASSWORD_UPDATE_WINDOW_SECONDS',
              DEFAULT_RATE_LIMITS.passwordUpdateWindowSeconds,
            ),
            max: this.getNumber(
              'RATE_LIMIT_PASSWORD_UPDATE_IP_MAX',
              DEFAULT_RATE_LIMITS.passwordUpdateIpMax,
            ),
            eventType: 'password_update_limited',
          },
        ];
      case 'authRefresh':
        return [
          {
            scope: 'auth_refresh',
            routeKey: 'auth:refresh',
            identity: 'ip',
            windowSeconds: this.getNumber(
              'RATE_LIMIT_REFRESH_WINDOW_SECONDS',
              DEFAULT_RATE_LIMITS.refreshWindowSeconds,
            ),
            max: this.getNumber(
              'RATE_LIMIT_REFRESH_MAX',
              DEFAULT_RATE_LIMITS.refreshMax,
            ),
            eventType: 'rate_limit_exceeded',
          },
        ];
      case 'authInitialize':
        return [
          {
            scope: 'auth_initialize',
            routeKey: 'auth:initialize',
            identity: 'user',
            windowSeconds: this.getNumber(
              'RATE_LIMIT_AUTH_INITIALIZE_WINDOW_SECONDS',
              DEFAULT_RATE_LIMITS.authInitializeWindowSeconds,
            ),
            max: this.getNumber(
              'RATE_LIMIT_AUTH_INITIALIZE_USER_MAX',
              DEFAULT_RATE_LIMITS.authInitializeUserMax,
            ),
            eventType: 'rate_limit_exceeded',
          },
        ];
      case 'coupleJoin':
        return [
          {
            scope: 'couple_join',
            routeKey: 'couples:join',
            identity: 'user',
            windowSeconds: this.getNumber(
              'RATE_LIMIT_COUPLE_JOIN_WINDOW_SECONDS',
              DEFAULT_RATE_LIMITS.coupleJoinWindowSeconds,
            ),
            max: this.getNumber(
              'RATE_LIMIT_COUPLE_JOIN_USER_MAX',
              DEFAULT_RATE_LIMITS.coupleJoinUserMax,
            ),
            eventType: 'rate_limit_exceeded',
          },
          {
            scope: 'couple_join',
            routeKey: 'couples:join',
            identity: 'ip',
            windowSeconds: this.getNumber(
              'RATE_LIMIT_COUPLE_JOIN_WINDOW_SECONDS',
              DEFAULT_RATE_LIMITS.coupleJoinWindowSeconds,
            ),
            max: this.getNumber(
              'RATE_LIMIT_COUPLE_JOIN_IP_MAX',
              DEFAULT_RATE_LIMITS.coupleJoinIpMax,
            ),
            eventType: 'rate_limit_exceeded',
          },
        ];
      case 'partnerInvite':
        return [
          {
            scope: 'partner_invite',
            routeKey: 'partner-requests:send',
            identity: 'user',
            windowSeconds: this.getNumber(
              'RATE_LIMIT_PARTNER_INVITE_WINDOW_SECONDS',
              DEFAULT_RATE_LIMITS.partnerInviteWindowSeconds,
            ),
            max: this.getNumber(
              'RATE_LIMIT_PARTNER_INVITE_USER_MAX',
              DEFAULT_RATE_LIMITS.partnerInviteUserMax,
            ),
            eventType: 'rate_limit_exceeded',
          },
        ];
      case 'chatbot':
        return [
          {
            scope: 'chatbot',
            routeKey: 'chatbot:chat',
            identity: 'user',
            windowSeconds: this.getNumber(
              'RATE_LIMIT_CHATBOT_WINDOW_SECONDS',
              DEFAULT_RATE_LIMITS.chatbotUserWindowSeconds,
            ),
            max: this.getNumber(
              'RATE_LIMIT_CHATBOT_MAX',
              DEFAULT_RATE_LIMITS.chatbotUserMax,
            ),
            eventType: 'chatbot_rate_limited',
          },
          {
            scope: 'chatbot',
            routeKey: 'chatbot:chat',
            identity: 'ip',
            windowSeconds: this.getNumber(
              'RATE_LIMIT_CHATBOT_IP_WINDOW_SECONDS',
              DEFAULT_RATE_LIMITS.chatbotIpWindowSeconds,
            ),
            max: this.getNumber(
              'RATE_LIMIT_CHATBOT_IP_MAX',
              DEFAULT_RATE_LIMITS.chatbotIpMax,
            ),
            eventType: 'chatbot_rate_limited',
          },
        ];
      case 'ai':
        return [
          {
            scope: 'ai',
            routeKey: 'ai:process-statement',
            identity: 'user',
            windowSeconds: this.getNumber(
              'RATE_LIMIT_AI_WINDOW_SECONDS',
              DEFAULT_RATE_LIMITS.aiUserWindowSeconds,
            ),
            max: this.getNumber(
              'RATE_LIMIT_AI_MAX',
              DEFAULT_RATE_LIMITS.aiUserMax,
            ),
            eventType: 'ai_rate_limited',
          },
          {
            scope: 'ai',
            routeKey: 'ai:process-statement',
            identity: 'ip',
            windowSeconds: this.getNumber(
              'RATE_LIMIT_AI_IP_WINDOW_SECONDS',
              DEFAULT_RATE_LIMITS.aiIpWindowSeconds,
            ),
            max: this.getNumber(
              'RATE_LIMIT_AI_IP_MAX',
              DEFAULT_RATE_LIMITS.aiIpMax,
            ),
            eventType: 'ai_rate_limited',
          },
        ];
    }
  }

  private buildRateLimitKey(
    routeKey: string,
    identity: RateLimitIdentity,
    identifier: string,
  ): string {
    return `rl:${routeKey}:${identity}:${identifier}`;
  }

  private getIdentifier(
    request: RateLimitRequest,
    identity: RateLimitIdentity,
  ): string {
    const ipHash = this.hashIdentifier(this.getClientIp(request));

    if (identity === 'ip') return ipHash;

    if (identity === 'user') {
      return this.hashIdentifier(request.user?.id ?? this.getClientIp(request));
    }

    const emailHash = this.hashIdentifier(this.getEmailFromBody(request));

    if (identity === 'email') return emailHash;
    return `${ipHash}:${emailHash}`;
  }

  getClientIp(request: RateLimitRequest): string {
    return request.ip ?? request.socket.remoteAddress ?? 'unknown';
  }

  getEmailHashFromRequest(request: RateLimitRequest): string | undefined {
    const email = this.getOptionalEmailFromBody(request);
    return email ? this.hashIdentifier(email) : undefined;
  }

  getUserIdHashFromRequest(request: RateLimitRequest): string | undefined {
    return request.user?.id ? this.hashIdentifier(request.user.id) : undefined;
  }

  private getEmailFromBody(request: RateLimitRequest): string {
    return this.getOptionalEmailFromBody(request) ?? 'missing-email';
  }

  private getOptionalEmailFromBody(
    request: RateLimitRequest,
  ): string | undefined {
    const body = request.body as Record<string, unknown> | undefined;
    const email = body?.['email'];
    return typeof email === 'string' && email.trim() ? email : undefined;
  }

  private getNumber(key: string, fallback: number): number {
    const value = this.configService.get<string | number>(key);
    const parsed =
      typeof value === 'number'
        ? value
        : typeof value === 'string'
          ? Number(value)
          : NaN;

    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  }

  private getResetAtUnixSeconds(retryAfterSeconds: number): number {
    return Math.ceil(Date.now() / 1000) + retryAfterSeconds;
  }

  private getFailOpenResult(rule: RateLimitRule): RateLimitResult {
    return {
      allowed: true,
      scope: rule.scope,
      limit: rule.max,
      remaining: rule.max,
      retryAfterSeconds: 0,
      resetAtUnixSeconds: Math.ceil(Date.now() / 1000),
      key: 'fail-open',
    };
  }
}
