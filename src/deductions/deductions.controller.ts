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
import { DeductionsService } from './deductions.service.js';
import { CreateDeductionDto } from './dto/create-deduction.dto.js';
import { UpdateDeductionDto } from './dto/update-deduction.dto.js';
import { CoupleContextService } from '../common/services/couple-context.service.js';

@Controller('deductions')
@UseGuards(AuthGuard)
export class DeductionsController {
  constructor(
    private readonly deductionsService: DeductionsService,
    private readonly coupleContextService: CoupleContextService,
  ) {}

  @Get()
  async getDeductions(@Req() req: Request & { user: AuthenticatedUser }) {
    const coupleId = await this.coupleContextService.getCoupleIdOrThrow(
      req.user.id,
    );
    return this.deductionsService.getDeductions(coupleId);
  }

  @Post()
  async createDeduction(
    @Body() dto: CreateDeductionDto,
    @Req() req: Request & { user: AuthenticatedUser },
  ) {
    const coupleId = await this.coupleContextService.getCoupleIdOrThrow(
      req.user.id,
    );
    return this.deductionsService.createDeduction(coupleId, req.user.id, dto);
  }

  @Put(':id')
  async updateDeduction(
    @Param('id') id: string,
    @Body() dto: UpdateDeductionDto,
    @Req() req: Request & { user: AuthenticatedUser },
  ) {
    const coupleId = await this.coupleContextService.getCoupleIdOrThrow(
      req.user.id,
    );
    return this.deductionsService.updateDeduction(coupleId, id, dto);
  }

  @Delete(':id')
  async deleteDeduction(
    @Param('id') id: string,
    @Req() req: Request & { user: AuthenticatedUser },
  ) {
    const coupleId = await this.coupleContextService.getCoupleIdOrThrow(
      req.user.id,
    );
    return this.deductionsService.deleteDeduction(coupleId, id);
  }
}
