import { Module } from '@nestjs/common';
import { CouplesModule } from '../couples/couples.module.js';
import { SupabaseModule } from '../supabase/supabase.module.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';

@Module({
  imports: [SupabaseModule, CouplesModule],
  controllers: [AuthController],
  providers: [AuthService],
})
export class AuthModule {}
