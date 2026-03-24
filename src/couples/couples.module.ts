import { Module } from '@nestjs/common';
import { SupabaseModule } from '../supabase/supabase.module.js';
import { CouplesController } from './couples.controller.js';
import { CouplesService } from './couples.service.js';

@Module({
  imports: [SupabaseModule],
  controllers: [CouplesController],
  providers: [CouplesService],
  exports: [CouplesService],
})
export class CouplesModule {}
