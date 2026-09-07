import {
  BadRequestException,
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
import { PersonalizeDto } from './dto/personalize.dto.js'
import { ResetQueryDto } from './dto/reset-query.dto.js'

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

  private assertType(type: string): MonthlyType {
    if (type !== 'incomes' && type !== 'deductions') {
      throw new BadRequestException('type debe ser incomes o deductions')
    }
    return type
  }

  @Post('personalize')
  async personalize(
    @Body() body: PersonalizeDto,
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
    @Query() query: ResetQueryDto,
    @Req() req: Request & { user: AuthenticatedUser },
  ) {
    const coupleId = await this.coupleId(req.user.id)
    await this.service.reset(
      coupleId,
      query.month,
      query.year,
      query.type ?? 'both',
    )
    return { reset: true }
  }

  @Post(':type')
  async create(
    @Param('type') type: string,
    @Body() dto: CreateMonthlyEntryDto,
    @Req() req: Request & { user: AuthenticatedUser },
  ) {
    const t = this.assertType(type)
    const ownerId = req.user.id
    const coupleId = await this.coupleId(ownerId)
    return this.service.createEntry(coupleId, ownerId, t, dto)
  }

  @Put(':type/:id')
  async update(
    @Param('type') type: string,
    @Param('id') id: string,
    @Body() dto: UpdateMonthlyEntryDto,
    @Req() req: Request & { user: AuthenticatedUser },
  ) {
    const t = this.assertType(type)
    const coupleId = await this.coupleId(req.user.id)
    return this.service.updateEntry(coupleId, t, id, dto)
  }

  @Delete(':type/:id')
  async remove(
    @Param('type') type: string,
    @Param('id') id: string,
    @Req() req: Request & { user: AuthenticatedUser },
  ) {
    const t = this.assertType(type)
    const coupleId = await this.coupleId(req.user.id)
    return this.service.deleteEntry(coupleId, t, id)
  }
}
