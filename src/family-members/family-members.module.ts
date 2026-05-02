import { Module } from '@nestjs/common'
import { FamilyMembersController } from './family-members.controller.js'
import { FamilyMembersService } from './family-members.service.js'

@Module({
  controllers: [FamilyMembersController],
  providers: [FamilyMembersService],
})
export class FamilyMembersModule {}
