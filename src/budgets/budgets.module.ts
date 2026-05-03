import { Module } from '@nestjs/common';
import { BudgetsService } from './budgets.service.js';
import { BudgetsController } from './budgets.controller.js';

@Module({
  controllers: [BudgetsController],
  providers: [BudgetsService],
  exports: [BudgetsService],
})
export class BudgetsModule {}
