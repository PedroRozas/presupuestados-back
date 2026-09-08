import { ForbiddenException, type ExecutionContext } from '@nestjs/common';
import type { ReceiptConfigService } from '../receipt.config.js';
import { TelegramSecretGuard } from './telegram-secret.guard.js';

const SECRET = 'a-very-long-secret-token';

const buildContext = (headerValue?: string): ExecutionContext =>
  ({
    switchToHttp: () => ({
      getRequest: () => ({
        headers:
          headerValue === undefined
            ? {}
            : { 'x-telegram-bot-api-secret-token': headerValue },
      }),
    }),
  }) as unknown as ExecutionContext;

const buildGuard = (configured: string | undefined): TelegramSecretGuard => {
  const config = {
    get telegramWebhookSecret(): string {
      if (configured === undefined) throw new Error('missing');
      return configured;
    },
  } as unknown as ReceiptConfigService;
  return new TelegramSecretGuard(config);
};

describe('TelegramSecretGuard', () => {
  it('acepta el secreto correcto', () => {
    expect(buildGuard(SECRET).canActivate(buildContext(SECRET))).toBe(true);
  });

  it('rechaza con 403 si falta el header', () => {
    expect(() => buildGuard(SECRET).canActivate(buildContext())).toThrow(
      ForbiddenException,
    );
  });

  it('rechaza con 403 si el secreto no está configurado', () => {
    expect(() =>
      buildGuard(undefined).canActivate(buildContext(SECRET)),
    ).toThrow(ForbiddenException);
  });

  it('rechaza con 403 un secreto de distinta longitud', () => {
    expect(() => buildGuard(SECRET).canActivate(buildContext('short'))).toThrow(
      ForbiddenException,
    );
  });

  it('rechaza con 403 un secreto de igual longitud pero distinto', () => {
    const wrong = `${SECRET.slice(0, -1)}X`;
    expect(() => buildGuard(SECRET).canActivate(buildContext(wrong))).toThrow(
      ForbiddenException,
    );
  });
});
