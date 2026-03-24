import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { AuthGuard, AuthenticatedUser } from '../common/guards/auth.guard.js';
import { BudgetsService } from './budgets.service.js';
import { CreateBudgetDto } from './dto/create-budget.dto.js';
import { UpdateBudgetDto } from './dto/update-budget.dto.js';
import { CoupleContextService } from '../common/services/couple-context.service.js';

@Controller('budgets')
@UseGuards(AuthGuard)
export class BudgetsController {
  constructor(
    private readonly budgetsService: BudgetsService,
    private readonly coupleContextService: CoupleContextService,
  ) {}

  @Get()
  async getBudgets(@Req() req: Request & { user: AuthenticatedUser }) {
    const coupleId = await this.coupleContextService.getCoupleIdOrThrow(
      req.user.id,
    );
    return this.budgetsService.getBudgets(coupleId);
  }

  @Post()
  async createBudget(
    @Body() dto: CreateBudgetDto,
    @Req() req: Request & { user: AuthenticatedUser },
  ) {
    const coupleId = await this.coupleContextService.getCoupleIdOrThrow(
      req.user.id,
    );
    return this.budgetsService.createBudget(coupleId, req.user.id, dto);
  }

  @Put(':id')
  async updateBudget(
    @Param('id') id: string,
    @Body() dto: UpdateBudgetDto,
    @Req() req: Request & { user: AuthenticatedUser },
  ) {
    const coupleId = await this.coupleContextService.getCoupleIdOrThrow(
      req.user.id,
    );
    return this.budgetsService.updateBudget(coupleId, id, dto);
  }

  @Delete(':id')
  async deleteBudget(
    @Param('id') id: string,
    @Req() req: Request & { user: AuthenticatedUser },
  ) {
    const coupleId = await this.coupleContextService.getCoupleIdOrThrow(
      req.user.id,
    );
    return this.budgetsService.deleteBudget(coupleId, id);
  }
}
