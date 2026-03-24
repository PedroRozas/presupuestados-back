import { Module } from '@nestjs/common';
import { ChatbotController } from './chatbot.controller.js';
import { ChatbotService } from './chatbot.service.js';
import { ExpensesModule } from '../expenses/expenses.module.js';
import { SupabaseModule } from '../supabase/supabase.module.js';
import { ConfigModule } from '@nestjs/config';

@Module({
  imports: [ExpensesModule, SupabaseModule, ConfigModule],
  controllers: [ChatbotController],
  providers: [ChatbotService],
})
export class ChatbotModule {}
