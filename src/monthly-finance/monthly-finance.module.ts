import { Module } from '@nestjs/common'
import { MonthlyFinanceController } from './monthly-finance.controller.js'
import { MonthlyFinanceService } from './monthly-finance.service.js'

@Module({
  controllers: [MonthlyFinanceController],
  providers: [MonthlyFinanceService],
  exports: [MonthlyFinanceService],
})
export class MonthlyFinanceModule {}
