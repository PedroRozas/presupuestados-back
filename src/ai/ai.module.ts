import { Module } from '@nestjs/common'
import { AIService } from './ai.service.js'
import { AIController } from './ai.controller.js'

@Module({
  controllers: [AIController],
  providers: [AIService],
})
export class AIModule {}
