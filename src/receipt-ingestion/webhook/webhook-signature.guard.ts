import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'node:crypto';
import type { Request } from 'express';
import { ReceiptConfigService } from '../receipt.config.js';

const SIGNATURE_HEADER = 'x-hub-signature-256';
const SIGNATURE_PREFIX = 'sha256=';

export const computeWebhookSignature = (
  secret: string,
  rawBody: Buffer,
): string =>
  `${SIGNATURE_PREFIX}${createHmac('sha256', secret).update(rawBody).digest('hex')}`;

@Injectable()
export class WebhookSignatureGuard implements CanActivate {
  constructor(private readonly config: ReceiptConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const received = this.readSignatureHeader(request);
    const rawBody = request.rawBody;

    if (!received || !rawBody) {
      throw new ForbiddenException();
    }

    const expected = computeWebhookSignature(
      this.config.whatsappAppSecret,
      rawBody,
    );
    const receivedBuffer = Buffer.from(received);
    const expectedBuffer = Buffer.from(expected);

    if (
      receivedBuffer.length !== expectedBuffer.length ||
      !timingSafeEqual(receivedBuffer, expectedBuffer)
    ) {
      throw new ForbiddenException();
    }

    return true;
  }

  private readSignatureHeader(request: Request): string | undefined {
    const value = request.headers[SIGNATURE_HEADER];
    return typeof value === 'string' ? value : undefined;
  }
}
