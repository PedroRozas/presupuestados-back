import { Module } from '@nestjs/common'
import { PartnerRequestsController } from './partner-requests.controller.js'
import { PartnerRequestsService } from './partner-requests.service.js'

@Module({
  controllers: [PartnerRequestsController],
  providers: [PartnerRequestsService],
})
export class PartnerRequestsModule {}
