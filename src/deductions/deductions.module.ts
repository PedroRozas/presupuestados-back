import { Module } from '@nestjs/common';
import { DeductionsService } from './deductions.service.js';
import { DeductionsController } from './deductions.controller.js';
import { SupabaseModule } from '../supabase/supabase.module.js';

@Module({
  imports: [SupabaseModule],
  controllers: [DeductionsController],
  providers: [DeductionsService],
  exports: [DeductionsService],
})
export class DeductionsModule {}
