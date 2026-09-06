import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import {
  AuthGuard,
  AuthenticatedUser,
} from '../../common/guards/auth.guard.js';
import { CoupleContextService } from '../../common/services/couple-context.service.js';
import { ComparisonQueryDto } from './dto/comparison-query.dto.js';
import { MonthQueryDto } from './dto/month-query.dto.js';
import { ReplaceItemsDto } from './dto/replace-items.dto.js';
import { UpdateGroupDto } from './dto/update-group.dto.js';
import type {
  ReceiptAccessDto,
  ReceiptGroupDetailDto,
  ReceiptsComparisonDto,
  ReceiptsMonthListDto,
  ReceiptsSummaryDto,
} from './receipts.mappers.js';
import { ReceiptsService } from './receipts.service.js';

type AuthenticatedRequest = Request & { user: AuthenticatedUser };

const HTTP_OK = 200;

@Controller('receipts')
@UseGuards(AuthGuard)
export class ReceiptsController {
  constructor(
    private readonly receipts: ReceiptsService,
    private readonly coupleContext: CoupleContextService,
  ) {}

  @Get('access')
  access(@Req() req: AuthenticatedRequest): Promise<ReceiptAccessDto> {
    return this.receipts.getAccess(req.user.id);
  }

  @Get('groups')
  async listGroups(
    @Query() query: MonthQueryDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<ReceiptsMonthListDto> {
    const coupleId = await this.coupleId(req);
    return this.receipts.listForMonth(coupleId, query.year, query.month);
  }

  @Get('summary')
  async summary(
    @Query() query: MonthQueryDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<ReceiptsSummaryDto> {
    const coupleId = await this.coupleId(req);
    return this.receipts.summary(coupleId, query.year, query.month);
  }

  @Get('comparison')
  async comparison(
    @Query() query: ComparisonQueryDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<ReceiptsComparisonDto> {
    const coupleId = await this.coupleId(req);
    return this.receipts.comparison(coupleId, query.months);
  }

  @Get('groups/:id')
  async detail(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: AuthenticatedRequest,
  ): Promise<ReceiptGroupDetailDto> {
    const coupleId = await this.coupleId(req);
    return this.receipts.getDetail(coupleId, id);
  }

  @Patch('groups/:id')
  async updateHeader(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateGroupDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<ReceiptGroupDetailDto> {
    const coupleId = await this.coupleId(req);
    return this.receipts.updateHeader(coupleId, id, dto);
  }

  @Put('groups/:id/items')
  async replaceItems(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReplaceItemsDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<ReceiptGroupDetailDto> {
    const coupleId = await this.coupleId(req);
    return this.receipts.replaceItems(coupleId, id, dto);
  }

  @Post('groups/:id/normalize')
  @HttpCode(HTTP_OK)
  async normalize(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: AuthenticatedRequest,
  ): Promise<{ enqueued: true }> {
    const coupleId = await this.coupleId(req);
    return this.receipts.requestNormalization(coupleId, id);
  }

  private coupleId(req: AuthenticatedRequest): Promise<string> {
    return this.coupleContext.getCoupleIdOrThrow(req.user.id);
  }
}
