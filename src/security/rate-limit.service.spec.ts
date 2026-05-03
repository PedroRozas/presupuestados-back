import { ConfigService } from '@nestjs/config';
import { RateLimitService } from './rate-limit.service.js';
import { RedisService } from './redis.service.js';
import { SecurityEventsService } from './security-events.service.js';
import type { RateLimitRequest } from './security.types.js';

describe('RateLimitService', () => {
  const request = {
    ip: '203.0.113.10',
    socket: { remoteAddress: '203.0.113.10' },
    body: { email: 'person@example.com' },
  } as RateLimitRequest;

  const createService = (
    redisOverrides: Partial<RedisService> = {},
    configValues: Record<string, string> = {},
  ) => {
    const ttlByKey = new Map<string, number>();
    const countsByKey = new Map<string, number>();
    const setCooldownMock = jest.fn((key: string, ttlSeconds: number) => {
      ttlByKey.set(key, ttlSeconds);
      return Promise.resolve();
    });
    const logRedisUnavailableMock = jest.fn();

    const redis = {
      incrementWithTtl: jest.fn((key: string, ttlSeconds: number) => {
        const nextCount = (countsByKey.get(key) ?? 0) + 1;
        countsByKey.set(key, nextCount);
        ttlByKey.set(key, ttlSeconds);
        return Promise.resolve(nextCount);
      }),
      getTtl: jest.fn((key: string) => Promise.resolve(ttlByKey.get(key) ?? 0)),
      setCooldown: setCooldownMock,
      exists: jest.fn(() => Promise.resolve(false)),
      ...redisOverrides,
    } as unknown as jest.Mocked<RedisService>;

    const config = {
      get: jest.fn((key: string) => configValues[key]),
    } as unknown as ConfigService;

    const events = {
      logRedisUnavailable: logRedisUnavailableMock,
      logEvent: jest.fn(),
      hashIdentifier: jest.fn((value: string) => `hashed:${value}`),
    } as unknown as jest.Mocked<SecurityEventsService>;

    return {
      service: new RateLimitService(config, redis, events),
      redis,
      events,
      setCooldownMock,
      logRedisUnavailableMock,
    };
  };

  it('increments counters and returns remaining quota', async () => {
    const { service } = createService(
      {},
      { RATE_LIMIT_HASH_SALT: 'test-salt' },
    );

    const result = await service.checkGlobalLimit(request);

    expect(result).toMatchObject({
      allowed: true,
      limit: 120,
      remaining: 119,
      retryAfterSeconds: 60,
    });
    expect(result.key).not.toContain('203.0.113.10');
  });

  it('blocks when a rule exceeds the configured limit', async () => {
    const { service } = createService(
      {
        incrementWithTtl: jest.fn(() => Promise.resolve(3)),
        getTtl: jest.fn(() => Promise.resolve(41)),
      },
      {
        RATE_LIMIT_HASH_SALT: 'test-salt',
        RATE_LIMIT_GLOBAL_MAX: '2',
      },
    );

    const result = await service.checkGlobalLimit(request);

    expect(result).toMatchObject({
      allowed: false,
      limit: 2,
      remaining: 0,
      retryAfterSeconds: 41,
    });
  });

  it('uses cooldown for auth login after a limit is exceeded', async () => {
    const { service, setCooldownMock } = createService(
      {
        incrementWithTtl: jest.fn(() => Promise.resolve(2)),
        getTtl: jest.fn(() => Promise.resolve(900)),
      },
      {
        RATE_LIMIT_HASH_SALT: 'test-salt',
        RATE_LIMIT_AUTH_MAX: '1',
      },
    );

    const result = await service.checkPolicy('authLogin', request);

    expect(result.allowed).toBe(false);
    expect(setCooldownMock).toHaveBeenCalledWith(
      expect.stringContaining('cooldown:rl:auth:login:ip:'),
      900,
    );
  });

  it('fails open and logs when Redis is unavailable', async () => {
    const { service, logRedisUnavailableMock } = createService({
      incrementWithTtl: jest.fn(() =>
        Promise.reject(new Error('connection refused')),
      ),
    });

    const result = await service.checkGlobalLimit(request);

    expect(result).toMatchObject({
      allowed: true,
      key: 'fail-open',
    });
    expect(logRedisUnavailableMock).toHaveBeenCalled();
  });
});
