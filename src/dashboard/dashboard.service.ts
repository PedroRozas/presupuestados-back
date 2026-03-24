import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service.js';

@Injectable()
export class DashboardService {
  constructor(private readonly supabaseService: SupabaseService) {}

  /**
   * GET /dashboard
   * Retorna en un solo objeto todos los datos del hogar:
   * members, incomes, deductions, budgets y expenses.
   * Traducción de get_dashboard_data.
   */
  async getDashboardData(coupleId: string) {
    const supabase = this.supabaseService.getClient();

    // Ejecutar todas las consultas en paralelo para mejor rendimiento
    const [
      { data: members, error: membersError },
      { data: incomes, error: incomesError },
      { data: deductions, error: deductionsError },
      { data: budgets, error: budgetsError },
      { data: expenses, error: expensesError },
    ] = await Promise.all([
      supabase.from('family_members').select('*').eq('couple_id', coupleId),
      supabase.from('incomes').select('*').eq('couple_id', coupleId),
      supabase.from('deductions').select('*').eq('couple_id', coupleId),
      supabase.from('budgets').select('*').eq('couple_id', coupleId),
      supabase
        .from('expenses')
        .select('*')
        .eq('couple_id', coupleId)
        .order('date', { ascending: false }),
    ]);

    const firstError =
      membersError ??
      incomesError ??
      deductionsError ??
      budgetsError ??
      expensesError;

    if (firstError) {
      throw new InternalServerErrorException(
        `Error al obtener datos del dashboard: ${firstError.message}`,
      );
    }

    return {
      members: members ?? [],
      incomes: incomes ?? [],
      deductions: deductions ?? [],
      budgets: budgets ?? [],
      expenses: expenses ?? [],
    };
  }
}
