import { Module } from '@nestjs/common';
import { AIService } from './ai.service.js';
import { AIController } from './ai.controller.js';
import { AIUsageModule } from '../ai-usage/ai-usage.module.js';

@Module({
  imports: [AIUsageModule],
  controllers: [AIController],
  providers: [AIService],
})
export class AIModule {}
