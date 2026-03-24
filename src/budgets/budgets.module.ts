import { Module } from '@nestjs/common';
import { BudgetsService } from './budgets.service.js';
import { BudgetsController } from './budgets.controller.js';
import { SupabaseModule } from '../supabase/supabase.module.js';

@Module({
  imports: [SupabaseModule],
  controllers: [BudgetsController],
  providers: [BudgetsService],
  exports: [BudgetsService],
})
export class BudgetsModule {}
