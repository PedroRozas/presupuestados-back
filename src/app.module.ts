import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DatabaseModule } from './database/database.module.js';
import { CommonModule } from './common/common.module.js';
import { SupabaseModule } from './supabase/supabase.module.js';
import { AuthModule } from './auth/auth.module.js';
import { CouplesModule } from './couples/couples.module.js';
import { ExpensesModule } from './expenses/expenses.module.js';
import { IncomesModule } from './incomes/incomes.module.js';
import { DeductionsModule } from './deductions/deductions.module.js';
import { BudgetsModule } from './budgets/budgets.module.js';
import { ProfilesModule } from './profiles/profiles.module.js';
import { DashboardModule } from './dashboard/dashboard.module.js';
import { ChatbotModule } from './chatbot/chatbot.module.js';
import { AIModule } from './ai/ai.module.js';
import { PartnerRequestsModule } from './partner-requests/partner-requests.module.js';
import { FamilyMembersModule } from './family-members/family-members.module.js';
import { CategoriesModule } from './categories/categories.module.js';
import { AIUsageModule } from './ai-usage/ai-usage.module.js';
import { SecurityModule } from './security/security.module.js';
import { ExportsModule } from './exports/exports.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    SecurityModule,
    DatabaseModule,
    CommonModule,
    SupabaseModule,
    AuthModule,
    CouplesModule,
    ExpensesModule,
    IncomesModule,
    DeductionsModule,
    BudgetsModule,
    ProfilesModule,
    DashboardModule,
    ChatbotModule,
    AIModule,
    AIUsageModule,
    PartnerRequestsModule,
    FamilyMembersModule,
    CategoriesModule,
    ExportsModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
