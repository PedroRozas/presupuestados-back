import { Module } from '@nestjs/common';
import { ChatbotController } from './chatbot.controller.js';
import { ChatbotService } from './chatbot.service.js';
import { ExpensesModule } from '../expenses/expenses.module.js';
import { ConfigModule } from '@nestjs/config';
import { AIUsageModule } from '../ai-usage/ai-usage.module.js';
import { PromptSecurityService } from './prompt-security.service.js';

@Module({
  imports: [ExpensesModule, ConfigModule, AIUsageModule],
  controllers: [ChatbotController],
  providers: [ChatbotService, PromptSecurityService],
})
export class ChatbotModule {}
