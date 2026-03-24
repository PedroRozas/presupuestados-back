import { Module } from '@nestjs/common';
import { IncomesService } from './incomes.service.js';
import { IncomesController } from './incomes.controller.js';
import { SupabaseModule } from '../supabase/supabase.module.js';

@Module({
  imports: [SupabaseModule],
  controllers: [IncomesController],
  providers: [IncomesService],
  exports: [IncomesService],
})
export class IncomesModule {}
