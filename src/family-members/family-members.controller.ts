import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { AuthGuard, AuthenticatedUser } from '../common/guards/auth.guard.js';
import { FamilyMembersService } from './family-members.service.js';

@Controller('family-members')
@UseGuards(AuthGuard)
export class FamilyMembersController {
  constructor(private readonly familyMembersService: FamilyMembersService) {}

  @Get()
  async findAll(
    @Req() req: Request & { user: AuthenticatedUser },
  ): Promise<unknown[]> {
    return this.familyMembersService.findAll(req.user.id);
  }
}
