import { Controller, Get, Put, Body, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { AuthGuard, AuthenticatedUser } from '../common/guards/auth.guard.js';
import { ProfilesService } from './profiles.service.js';
import { UpdateProfileDto } from './dto/update-profile.dto.js';

@Controller('profiles')
@UseGuards(AuthGuard)
export class ProfilesController {
  constructor(private readonly profilesService: ProfilesService) {}

  @Get('me')
  async getMyProfile(@Req() req: Request & { user: AuthenticatedUser }) {
    return this.profilesService.getMyProfile(req.user.id);
  }

  @Put('me')
  async updateMyProfile(
    @Body() dto: UpdateProfileDto,
    @Req() req: Request & { user: AuthenticatedUser },
  ) {
    return this.profilesService.updateMyProfile(req.user.id, dto);
  }
}
