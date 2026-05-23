import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { AuthGuard, AuthenticatedUser } from '../common/guards/auth.guard.js';
import { PartnerRequestsService } from './partner-requests.service.js';
import { SendInviteDto } from './dto/send-invite.dto.js';
import { RateLimit } from '../security/decorators/rate-limit.decorator.js';

@Controller('partner-requests')
@UseGuards(AuthGuard)
export class PartnerRequestsController {
  constructor(
    private readonly partnerRequestsService: PartnerRequestsService,
  ) {}

  @Post()
  @RateLimit('partnerInvite')
  async sendInvite(
    @Body() dto: SendInviteDto,
    @Req() req: Request & { user: AuthenticatedUser },
  ): Promise<{ success: boolean }> {
    return this.partnerRequestsService.sendInvite(
      req.user.id,
      dto.receiver_email,
    );
  }

  @Get('pending')
  async getPendingInvites(
    @Req() req: Request & { user: AuthenticatedUser },
  ): Promise<unknown[]> {
    return this.partnerRequestsService.getPendingInvites(req.user.email);
  }

  @Post(':id/accept')
  async acceptInvite(
    @Param('id') id: string,
    @Req() req: Request & { user: AuthenticatedUser },
  ): Promise<{ success: boolean }> {
    return this.partnerRequestsService.acceptInvite(
      req.user.id,
      req.user.email,
      id,
    );
  }
}
