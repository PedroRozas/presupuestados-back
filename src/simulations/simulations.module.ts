import { Module } from '@nestjs/common'
import { SimulationsController } from './simulations.controller.js'
import { SimulationsService } from './simulations.service.js'

@Module({
  controllers: [SimulationsController],
  providers: [SimulationsService],
})
export class SimulationsModule {}
