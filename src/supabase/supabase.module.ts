import { Module } from '@nestjs/common';
import { SupabaseService } from './supabase.service.js';
import { CoupleContextService } from '../common/services/couple-context.service.js';

@Module({
  providers: [SupabaseService, CoupleContextService],
  exports: [SupabaseService, CoupleContextService],
})
export class SupabaseModule {}
