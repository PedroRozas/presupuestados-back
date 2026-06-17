import {
  Body,
  Controller,
  Delete,
  Param,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common'
import { Request } from 'express'
import { AuthGuard, AuthenticatedUser } from '../common/guards/auth.guard.js'
import { CoupleContextService } from '../common/services/couple-context.service.js'
import { MonthlyFinanceService } from './monthly-finance.service.js'
import type { MonthlyType } from './monthly-finance.service.js'
import { CreateMonthlyEntryDto } from './dto/create-monthly-entry.dto.js'
import { UpdateMonthlyEntryDto } from './dto/update-monthly-entry.dto.js'

@Controller('monthly-finance')
@UseGuards(AuthGuard)
export class MonthlyFinanceController {
  constructor(
    private readonly service: MonthlyFinanceService,
    private readonly coupleContextService: CoupleContextService,
  ) {}

  private coupleId(userId: string): Promise<string> {
    return this.coupleContextService.getCoupleIdOrThrow(userId)
  }

  @Post('personalize')
  async personalize(
    @Body() body: { month: number; year: number; type?: MonthlyType | 'both' },
    @Req() req: Request & { user: AuthenticatedUser },
  ) {
    const ownerId = req.user.id
    const coupleId = await this.coupleId(ownerId)
    await this.service.personalize(
      coupleId,
      ownerId,
      body.month,
      body.year,
      body.type ?? 'both',
    )
    return { personalized: true }
  }

  @Delete('reset')
  async reset(
    @Query('month') month: string,
    @Query('year') year: string,
    @Query('type') type: MonthlyType | 'both' | undefined,
    @Req() req: Request & { user: AuthenticatedUser },
  ) {
    const coupleId = await this.coupleId(req.user.id)
    await this.service.reset(
      coupleId,
      parseInt(month, 10),
      parseInt(year, 10),
      type ?? 'both',
    )
    return { reset: true }
  }

  @Post(':type')
  async create(
    @Param('type') type: MonthlyType,
    @Body() dto: CreateMonthlyEntryDto,
    @Req() req: Request & { user: AuthenticatedUser },
  ) {
    const ownerId = req.user.id
    const coupleId = await this.coupleId(ownerId)
    return this.service.createEntry(coupleId, ownerId, type, dto)
  }

  @Put(':type/:id')
  async update(
    @Param('type') type: MonthlyType,
    @Param('id') id: string,
    @Body() dto: UpdateMonthlyEntryDto,
    @Req() req: Request & { user: AuthenticatedUser },
  ) {
    const coupleId = await this.coupleId(req.user.id)
    return this.service.updateEntry(coupleId, type, id, dto)
  }

  @Delete(':type/:id')
  async remove(
    @Param('type') type: MonthlyType,
    @Param('id') id: string,
    @Req() req: Request & { user: AuthenticatedUser },
  ) {
    const coupleId = await this.coupleId(req.user.id)
    return this.service.deleteEntry(coupleId, type, id)
  }
}
