import { Module } from '@nestjs/common';
import { DeductionsService } from './deductions.service.js';
import { DeductionsController } from './deductions.controller.js';

@Module({
  controllers: [DeductionsController],
  providers: [DeductionsService],
  exports: [DeductionsService],
})
export class DeductionsModule {}
