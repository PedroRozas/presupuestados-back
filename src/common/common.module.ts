import { Module, Global } from '@nestjs/common';
import { SupabaseModule } from '../supabase/supabase.module.js';
import { AuthGuard } from './guards/auth.guard.js';
import { CoupleContextService } from './services/couple-context.service.js';

@Global()
@Module({
  imports: [SupabaseModule],
  providers: [AuthGuard, CoupleContextService],
  exports: [AuthGuard, CoupleContextService],
})
export class CommonModule {}
