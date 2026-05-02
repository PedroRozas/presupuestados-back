import { Module } from '@nestjs/common'
import { IncomesService } from './incomes.service.js'
import { IncomesController } from './incomes.controller.js'

@Module({
  controllers: [IncomesController],
  providers: [IncomesService],
  exports: [IncomesService],
})
export class IncomesModule {}
