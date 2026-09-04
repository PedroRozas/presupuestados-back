import { ForbiddenException, type ExecutionContext } from '@nestjs/common';
import {
  WebhookSignatureGuard,
  computeWebhookSignature,
} from './webhook-signature.guard.js';
import type { ReceiptConfigService } from '../receipt.config.js';

const SECRET = 'test-secret';

const buildContext = (
  rawBody: Buffer | undefined,
  signature: string | undefined,
): ExecutionContext =>
  ({
    switchToHttp: () => ({
      getRequest: () => ({
        rawBody,
        headers: signature ? { 'x-hub-signature-256': signature } : {},
      }),
    }),
  }) as unknown as ExecutionContext;

describe('WebhookSignatureGuard', () => {
  const config = { whatsappAppSecret: SECRET } as ReceiptConfigService;
  const guard = new WebhookSignatureGuard(config);
  const body = Buffer.from('{"object":"whatsapp_business_account"}');

  it('acepta una firma válida', () => {
    const signature = computeWebhookSignature(SECRET, body);
    expect(guard.canActivate(buildContext(body, signature))).toBe(true);
  });

  it('rechaza una firma inválida con 403', () => {
    expect(() =>
      guard.canActivate(buildContext(body, 'sha256=deadbeef')),
    ).toThrow(ForbiddenException);
  });

  it('rechaza si falta el header', () => {
    expect(() => guard.canActivate(buildContext(body, undefined))).toThrow(
      ForbiddenException,
    );
  });

  it('rechaza si falta el body crudo', () => {
    const signature = computeWebhookSignature(SECRET, body);
    expect(() => guard.canActivate(buildContext(undefined, signature))).toThrow(
      ForbiddenException,
    );
  });
});
