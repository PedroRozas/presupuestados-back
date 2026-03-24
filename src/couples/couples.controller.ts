import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { AuthGuard, AuthenticatedUser } from '../common/guards/auth.guard.js';
import { CouplesService } from './couples.service.js';
import { JoinCoupleDto } from './dto/join-couple.dto.js';

@Controller('couples')
export class CouplesController {
  constructor(private readonly couplesService: CouplesService) {}

  /**
   * POST /couples/join
   * Vincula al usuario autenticado con una pareja mediante un código de invitación.
   * Requiere Bearer token de Supabase Auth en el header Authorization.
   */
  @Post('join')
  @UseGuards(AuthGuard)
  async joinCouple(
    @Body() dto: JoinCoupleDto,
    @Req() req: Request & { user: AuthenticatedUser },
  ): Promise<{ message: string }> {
    return this.couplesService.joinCouple(req.user.id, dto.p_code);
  }
}
