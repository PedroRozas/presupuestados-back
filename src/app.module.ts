import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { CouplesModule } from './couples/couples.module.js';
import { SupabaseModule } from './supabase/supabase.module.js';
import { ExpensesModule } from './expenses/expenses.module.js';
import { AuthModule } from './auth/auth.module.js';
import { AIModule } from './ai/ai.module.js';
import { ChatbotModule } from './chatbot/chatbot.module.js';
import { ProfilesModule } from './profiles/profiles.module.js';
import { IncomesModule } from './incomes/incomes.module.js';
import { BudgetsModule } from './budgets/budgets.module.js';
import { DeductionsModule } from './deductions/deductions.module.js';
import { DashboardModule } from './dashboard/dashboard.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    SupabaseModule,
    CouplesModule,
    ExpensesModule,
    AuthModule,
    AIModule,
    ChatbotModule,
    ProfilesModule,
    IncomesModule,
    BudgetsModule,
    DeductionsModule,
    DashboardModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
