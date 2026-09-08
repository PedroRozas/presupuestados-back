import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { timingSafeEqual } from 'node:crypto';
import type { Request } from 'express';
import { ReceiptConfigService } from '../receipt.config.js';
import { TELEGRAM_SECRET_HEADER } from '../receipt.constants.js';

type RejectionReason = 'missing_header' | 'missing_secret' | 'mismatch';

@Injectable()
export class TelegramSecretGuard implements CanActivate {
  private readonly logger = new Logger(TelegramSecretGuard.name);

  constructor(private readonly config: ReceiptConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const received = this.readHeader(request);
    if (!received) this.reject('missing_header');

    const expected = this.readConfiguredSecret();
    if (!expected) this.reject('missing_secret');

    const receivedBuffer = Buffer.from(received);
    const expectedBuffer = Buffer.from(expected);
    if (
      receivedBuffer.length !== expectedBuffer.length ||
      !timingSafeEqual(receivedBuffer, expectedBuffer)
    ) {
      this.reject('mismatch');
    }
    return true;
  }

  private readHeader(request: Request): string | undefined {
    const value = request.headers[TELEGRAM_SECRET_HEADER];
    return typeof value === 'string' && value.length > 0 ? value : undefined;
  }

  private readConfiguredSecret(): string | undefined {
    try {
      return this.config.telegramWebhookSecret;
    } catch {
      return undefined;
    }
  }

  private reject(reason: RejectionReason): never {
    this.logger.warn(`telegram_webhook_rejected reason=${reason}`);
    throw new ForbiddenException();
  }
}
