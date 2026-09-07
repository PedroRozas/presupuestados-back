import { Module } from '@nestjs/common';
import { DashboardService } from './dashboard.service.js';
import { DashboardController } from './dashboard.controller.js';
import { MonthlyFinanceModule } from '../monthly-finance/monthly-finance.module.js';

@Module({
  imports: [MonthlyFinanceModule],
  controllers: [DashboardController],
  providers: [DashboardService],
  exports: [DashboardService],
})
export class DashboardModule {}
