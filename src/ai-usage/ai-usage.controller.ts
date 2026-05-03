import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { AuthGuard, AuthenticatedUser } from '../common/guards/auth.guard.js';
import { AIUsageService } from './ai-usage.service.js';

@Controller('ai-usage')
@UseGuards(AuthGuard)
export class AIUsageController {
  constructor(private readonly aiUsageService: AIUsageService) {}

  @Get('status')
  getStatus(@Req() req: Request & { user: AuthenticatedUser }) {
    return this.aiUsageService.getStatusForUser(req.user.id);
  }
}
