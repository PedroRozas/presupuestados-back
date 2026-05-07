import { Module } from '@nestjs/common';
import { CommonModule } from '../common/common.module.js';
import { DashboardModule } from '../dashboard/dashboard.module.js';
import { ExportsController } from './exports.controller.js';
import { ExportsService } from './exports.service.js';

@Module({
  imports: [CommonModule, DashboardModule],
  controllers: [ExportsController],
  providers: [ExportsService],
})
export class ExportsModule {}
