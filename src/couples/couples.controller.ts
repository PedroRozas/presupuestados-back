import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { AuthGuard, AuthenticatedUser } from '../common/guards/auth.guard.js';
import { CouplesService } from './couples.service.js';
import { JoinCoupleDto } from './dto/join-couple.dto.js';
import { RateLimit } from '../security/decorators/rate-limit.decorator.js';

@Controller('couples')
export class CouplesController {
  constructor(private readonly couplesService: CouplesService) {}

  /**
   * POST /couples/join
   * Vincula al usuario autenticado con una pareja mediante un código de invitación.
   * Requiere Bearer token de Supabase Auth en el header Authorization.
   */
  @Post('join')
  @RateLimit('coupleJoin')
  @UseGuards(AuthGuard)
  async joinCouple(
    @Body() dto: JoinCoupleDto,
    @Req() req: Request & { user: AuthenticatedUser },
  ): Promise<{ message: string }> {
    return this.couplesService.joinCouple(req.user.id, dto.p_code);
  }

  @Get('partner-email')
  @UseGuards(AuthGuard)
  async getPartnerEmail(
    @Req() req: Request & { user: AuthenticatedUser },
  ): Promise<{ email: string | null }> {
    return this.couplesService.getLinkedPartnerEmail(req.user.id);
  }

  @Get('me')
  @UseGuards(AuthGuard)
  async getMyCouple(
    @Req() req: Request & { user: AuthenticatedUser },
  ): Promise<{ id: string; inviteCode: string }> {
    return this.couplesService.getMyCouple(req.user.id);
  }
}
