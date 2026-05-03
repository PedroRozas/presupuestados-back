import { Global, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { GlobalRateLimitGuard } from './guards/global-rate-limit.guard.js';
import { RateLimitGuard } from './guards/rate-limit.guard.js';
import { RateLimitService } from './rate-limit.service.js';
import { RedisService } from './redis.service.js';
import { SecurityEventsService } from './security-events.service.js';

@Global()
@Module({
  providers: [
    RedisService,
    RateLimitService,
    RateLimitGuard,
    SecurityEventsService,
    {
      provide: APP_GUARD,
      useClass: GlobalRateLimitGuard,
    },
  ],
  exports: [
    RateLimitService,
    RedisService,
    SecurityEventsService,
    RateLimitGuard,
  ],
})
export class SecurityModule {}
