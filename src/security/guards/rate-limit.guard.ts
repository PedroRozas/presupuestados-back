import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Response } from 'express';
import {
  RATE_LIMIT_ERROR_CODE,
  RATE_LIMIT_ERROR_MESSAGE,
  RATE_LIMIT_POLICY_METADATA,
} from '../security.constants.js';
import { RateLimitService } from '../rate-limit.service.js';
import { SecurityEventsService } from '../security-events.service.js';
import type {
  RateLimitPolicy,
  RateLimitRequest,
  RateLimitResult,
} from '../security.types.js';

@Injectable()
export class RateLimitGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly rateLimitService: RateLimitService,
    private readonly securityEventsService: SecurityEventsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const policy = this.reflector.getAllAndOverride<RateLimitPolicy>(
      RATE_LIMIT_POLICY_METADATA,
      [context.getHandler(), context.getClass()],
    );

    if (!policy) return true;

    const http = context.switchToHttp();
    const request = http.getRequest<RateLimitRequest>();
    const response = http.getResponse<Response>();
    const result = await this.rateLimitService.checkPolicy(policy, request);

    this.setHeaders(response, result);

    if (result.allowed) return true;

    this.securityEventsService.logEvent({
      event:
        result.scope === 'auth_login'
          ? 'auth_login_blocked'
          : result.scope === 'password_reset'
            ? 'password_reset_limited'
            : result.scope === 'chatbot'
              ? 'chatbot_rate_limited'
              : result.scope === 'ai'
                ? 'ai_rate_limited'
                : 'rate_limit_exceeded',
      scope: result.scope,
      method: request.method,
      path: request.originalUrl,
      ipHash: this.rateLimitService.hashIdentifier(
        this.rateLimitService.getClientIp(request),
      ),
      emailHash: this.rateLimitService.getEmailHashFromRequest(request),
      userIdHash: this.rateLimitService.getUserIdHashFromRequest(request),
      retryAfterSeconds: result.retryAfterSeconds,
    });

    throw new HttpException(
      {
        code: RATE_LIMIT_ERROR_CODE,
        scope: result.scope,
        limit: result.limit,
        remaining: result.remaining,
        retryAfterSeconds: result.retryAfterSeconds,
        message: RATE_LIMIT_ERROR_MESSAGE,
      },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }

  private setHeaders(response: Response, result: RateLimitResult): void {
    response.setHeader('Retry-After', String(result.retryAfterSeconds));
    response.setHeader('X-RateLimit-Limit', String(result.limit));
    response.setHeader('X-RateLimit-Remaining', String(result.remaining));
    response.setHeader('X-RateLimit-Reset', String(result.resetAtUnixSeconds));
  }
}
