import {
  Controller,
  Get,
  Query,
  Req,
  Res,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { AuthGuard, AuthenticatedUser } from '../common/guards/auth.guard.js';
import { CoupleContextService } from '../common/services/couple-context.service.js';
import { MonthlyExportQueryDto } from './dto/monthly-export-query.dto.js';
import { ExportsService } from './exports.service.js';

@Controller('exports')
@UseGuards(AuthGuard)
export class ExportsController {
  constructor(
    private readonly exportsService: ExportsService,
    private readonly coupleContextService: CoupleContextService,
  ) {}

  @Get('monthly-summary')
  async getMonthlySummary(
    @Req() req: Request & { user: AuthenticatedUser },
    @Query() query: MonthlyExportQueryDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const coupleId = await this.coupleContextService.getCoupleIdOrThrow(
      req.user.id,
    );
    const file = await this.exportsService.buildMonthlySummaryExport(
      coupleId,
      query.month,
      query.year,
      query.format,
    );

    res.setHeader('Content-Type', file.contentType);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${file.filename}"`,
    );

    return new StreamableFile(file.buffer);
  }
}
