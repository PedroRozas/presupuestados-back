import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { AuthGuard, AuthenticatedUser } from '../common/guards/auth.guard.js';
import { DashboardService } from './dashboard.service.js';
import { CoupleContextService } from '../common/services/couple-context.service.js';

@Controller('dashboard')
@UseGuards(AuthGuard)
export class DashboardController {
  constructor(
    private readonly dashboardService: DashboardService,
    private readonly coupleContextService: CoupleContextService,
  ) {}

  @Get()
  async getDashboard(@Req() req: Request & { user: AuthenticatedUser }) {
    const coupleId = await this.coupleContextService.getCoupleIdOrThrow(
      req.user.id,
    );
    return this.dashboardService.getDashboardData(coupleId);
  }
}
