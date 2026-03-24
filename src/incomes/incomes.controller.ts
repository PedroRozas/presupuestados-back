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
import { IncomesService } from './incomes.service.js';
import { CreateIncomeDto } from './dto/create-income.dto.js';
import { UpdateIncomeDto } from './dto/update-income.dto.js';
import { CoupleContextService } from '../common/services/couple-context.service.js';

@Controller('incomes')
@UseGuards(AuthGuard)
export class IncomesController {
  constructor(
    private readonly incomesService: IncomesService,
    private readonly coupleContextService: CoupleContextService,
  ) {}

  @Get()
  async getIncomes(@Req() req: Request & { user: AuthenticatedUser }) {
    const coupleId = await this.coupleContextService.getCoupleIdOrThrow(
      req.user.id,
    );
    return this.incomesService.getIncomes(coupleId);
  }

  @Post()
  async createIncome(
    @Body() dto: CreateIncomeDto,
    @Req() req: Request & { user: AuthenticatedUser },
  ) {
    const coupleId = await this.coupleContextService.getCoupleIdOrThrow(
      req.user.id,
    );
    return this.incomesService.createIncome(coupleId, req.user.id, dto);
  }

  @Put(':id')
  async updateIncome(
    @Param('id') id: string,
    @Body() dto: UpdateIncomeDto,
    @Req() req: Request & { user: AuthenticatedUser },
  ) {
    const coupleId = await this.coupleContextService.getCoupleIdOrThrow(
      req.user.id,
    );
    return this.incomesService.updateIncome(coupleId, id, dto);
  }

  @Delete(':id')
  async deleteIncome(
    @Param('id') id: string,
    @Req() req: Request & { user: AuthenticatedUser },
  ) {
    const coupleId = await this.coupleContextService.getCoupleIdOrThrow(
      req.user.id,
    );
    return this.incomesService.deleteIncome(coupleId, id);
  }
}
