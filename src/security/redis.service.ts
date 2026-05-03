import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

const INCREMENT_WITH_TTL_SCRIPT = `
local current = redis.call("INCR", KEYS[1])
if current == 1 then
  redis.call("EXPIRE", KEYS[1], ARGV[1])
end
return current
`;

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private readonly client?: Redis;

  constructor(private readonly configService: ConfigService) {
    const redisUrl = this.configService.get<string>('REDIS_URL');

    if (!redisUrl) {
      this.logger.warn(
        'REDIS_URL no está configurado. Rate limiting queda en modo fail-open.',
      );
      return;
    }

    this.client = new Redis(redisUrl, {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      enableReadyCheck: true,
    });

    this.client.on('error', (error: Error) => {
      this.logger.error(`Redis error: ${error.message}`);
    });
    this.client.on('connect', () => {
      this.logger.log('Redis conectado');
    });
    this.client.on('reconnecting', () => {
      this.logger.warn('Redis reconectando');
    });
  }

  async onModuleInit(): Promise<void> {
    if (!this.client) return;

    try {
      await this.client.connect();
      await this.client.ping();
    } catch (error) {
      this.logger.error(
        `No se pudo conectar a Redis: ${this.getErrorMessage(error)}`,
      );
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (!this.client) return;
    await this.client.quit();
  }

  async incrementWithTtl(key: string, ttlSeconds: number): Promise<number> {
    const client = this.getClientOrThrow();
    const result = await client.eval(
      INCREMENT_WITH_TTL_SCRIPT,
      1,
      key,
      ttlSeconds,
    );

    return this.toNumber(result);
  }

  async getTtl(key: string): Promise<number> {
    const ttl = await this.getClientOrThrow().ttl(key);
    return ttl > 0 ? ttl : 0;
  }

  async setCooldown(key: string, ttlSeconds: number): Promise<void> {
    await this.getClientOrThrow().set(key, '1', 'EX', ttlSeconds);
  }

  async exists(key: string): Promise<boolean> {
    const result = await this.getClientOrThrow().exists(key);
    return result === 1;
  }

  private getClientOrThrow(): Redis {
    if (!this.client || this.client.status !== 'ready') {
      throw new Error('Redis no disponible');
    }

    return this.client;
  }

  private toNumber(value: unknown): number {
    if (typeof value === 'number') return value;
    if (typeof value === 'string') return Number(value);
    throw new Error('Respuesta inesperada de Redis');
  }

  private getErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : 'Error desconocido';
  }
}
