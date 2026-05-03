import { applyDecorators, SetMetadata, UseGuards } from '@nestjs/common';
import { RATE_LIMIT_POLICY_METADATA } from '../security.constants.js';
import type { RateLimitPolicy } from '../security.types.js';
import { RateLimitGuard } from '../guards/rate-limit.guard.js';

export function RateLimit(policy: RateLimitPolicy) {
  return applyDecorators(
    SetMetadata(RATE_LIMIT_POLICY_METADATA, policy),
    UseGuards(RateLimitGuard),
  );
}
