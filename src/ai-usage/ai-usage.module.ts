import { Module } from '@nestjs/common';
import { AIUsageController } from './ai-usage.controller.js';
import { AIUsageService } from './ai-usage.service.js';

@Module({
  controllers: [AIUsageController],
  providers: [AIUsageService],
  exports: [AIUsageService],
})
export class AIUsageModule {}
