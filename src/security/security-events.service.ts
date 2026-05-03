import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'node:crypto';
import type { SecurityEventContext } from './security.types.js';

@Injectable()
export class SecurityEventsService {
  private readonly logger = new Logger(SecurityEventsService.name);
  private readonly hashSalt: string;

  constructor(private readonly configService: ConfigService) {
    this.hashSalt =
      this.configService.get<string>('RATE_LIMIT_HASH_SALT') ??
      'presupuestados-dev-rate-limit-salt';
  }

  hashIdentifier(value: string): string {
    return createHash('sha256')
      .update(this.hashSalt)
      .update(':')
      .update(value.trim().toLowerCase())
      .digest('hex')
      .slice(0, 32);
  }

  logEvent(context: SecurityEventContext): void {
    this.logger.warn(JSON.stringify(context));
  }

  logRedisUnavailable(error: unknown): void {
    this.logEvent({
      event: 'redis_unavailable',
      redisError: error instanceof Error ? error.message : 'Error desconocido',
    });
  }

  logLoginFailed(email: string, reason?: string): void {
    this.logEvent({
      event: 'auth_login_failed',
      emailHash: this.hashIdentifier(email),
      redisError: reason,
    });
  }
}
