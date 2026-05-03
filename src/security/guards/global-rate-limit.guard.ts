import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import type { Response } from 'express';
import {
  RATE_LIMIT_ERROR_CODE,
  RATE_LIMIT_ERROR_MESSAGE,
} from '../security.constants.js';
import { RateLimitService } from '../rate-limit.service.js';
import { SecurityEventsService } from '../security-events.service.js';
import type { RateLimitRequest, RateLimitResult } from '../security.types.js';

@Injectable()
export class GlobalRateLimitGuard implements CanActivate {
  constructor(
    private readonly rateLimitService: RateLimitService,
    private readonly securityEventsService: SecurityEventsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const http = context.switchToHttp();
    const request = http.getRequest<RateLimitRequest>();

    if (this.shouldSkip(request)) return true;

    const response = http.getResponse<Response>();
    const result = await this.rateLimitService.checkGlobalLimit(request);

    this.setHeaders(response, result);

    if (result.allowed) return true;

    this.securityEventsService.logEvent({
      event: 'rate_limit_exceeded',
      scope: result.scope,
      method: request.method,
      path: request.originalUrl,
      ipHash: this.rateLimitService.hashIdentifier(
        this.rateLimitService.getClientIp(request),
      ),
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

  private shouldSkip(request: RateLimitRequest): boolean {
    if (request.method === 'OPTIONS') return true;

    const path = request.path ?? request.originalUrl ?? '';
    return path === '/api' || path.startsWith('/api/');
  }

  private setHeaders(response: Response, result: RateLimitResult): void {
    response.setHeader('Retry-After', String(result.retryAfterSeconds));
    response.setHeader('X-RateLimit-Limit', String(result.limit));
    response.setHeader('X-RateLimit-Remaining', String(result.remaining));
    response.setHeader('X-RateLimit-Reset', String(result.resetAtUnixSeconds));
  }
}
