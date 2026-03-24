import {
  Injectable,
  NotFoundException,
  InternalServerErrorException,
} from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { CreateExpenseDto } from './dto/create-expense.dto';
import { UpdateExpenseDto } from './dto/update-expense.dto.js';
import { UpdateRecurringExpenseDto } from './dto/update-recurring-expense.dto.js';
import { StopRecurringExpenseDto } from './dto/stop-recurring-expense.dto.js';
import { DeleteExpensesBatchDto } from './dto/delete-expenses-batch.dto.js';
import { Database } from '../supabase/database.types.js';

type ExpenseInsert = Database['public']['Tables']['expenses']['Insert'];

@Injectable()
export class ExpensesService {
  constructor(private readonly supabaseService: SupabaseService) {}

  private async calculateSplitDetails(expenseDate: Date, coupleId: string) {
    const supabase = this.supabaseService.getClient();
    const year = expenseDate.getFullYear();
    const month = expenseDate.getMonth() + 1;

    const { data: incomes, error } = await supabase
      .from('incomes')
      .select('amount, user_id, date')
      .eq('couple_id', coupleId);

    if (error) {
      throw new InternalServerErrorException(
        `Error fetching incomes: ${error.message}`,
      );
    }

    const currentMonthIncomes = incomes.filter((inc) => {
      const incDate = new Date(inc.date);
      return incDate.getFullYear() === year && incDate.getMonth() + 1 === month;
    });

    if (currentMonthIncomes.length === 0) {
      return { msg: 'No incomes found for the month, using 50/50 fallback.' };
    }

    const userTotals: Record<string, number> = {};
    for (const inc of currentMonthIncomes) {
      userTotals[inc.user_id] = (userTotals[inc.user_id] || 0) + inc.amount;
    }

    const userIds = Object.keys(userTotals);
    const totalIncome = Object.values(userTotals).reduce(
      (sum, val) => sum + val,
      0,
    );

    const splitPercentages: Record<string, number> = {};
    for (const userId of userIds) {
      splitPercentages[userId] =
        totalIncome > 0 ? (userTotals[userId] / totalIncome) * 100 : 50;
    }

    return { totalIncome, splitPercentages };
  }

  async addExpense(
    coupleId: string,
    ownerId: string,
    createExpenseDto: CreateExpenseDto,
  ) {
    const supabase = this.supabaseService.getClient();

    if (createExpenseDto.p_split_method === 'proportional') {
      // Execute the division calculation as required by the rules.
      await this.calculateSplitDetails(
        new Date(createExpenseDto.p_date),
        coupleId,
      );
    }

    const newExpense: ExpenseInsert = {
      id: createExpenseDto.p_expense_id,
      amount: createExpenseDto.p_amount,
      assigned_user_id: createExpenseDto.p_assigned_user_id,
      batch_id: createExpenseDto.p_batch_id,
      batch_name: createExpenseDto.p_batch_name,
      budget_id: createExpenseDto.p_budget_id,
      category_id: createExpenseDto.p_category_id,
      couple_id: coupleId,
      date: createExpenseDto.p_date,
      description: createExpenseDto.p_description,
      is_credit: createExpenseDto.p_is_credit,
      is_recurring: createExpenseDto.p_is_recurring,
      owner_id: ownerId,
      paid_by: createExpenseDto.p_paid_by,
      recurrence_end_date: createExpenseDto.p_recurrence_end_date,
      recurrence_interval: createExpenseDto.p_recurrence_interval,
      split_method: createExpenseDto.p_split_method,
    };

    const { data, error } = await supabase
      .from('expenses')
      .insert(newExpense)
      .select()
      .single();

    if (error) throw new InternalServerErrorException(error.message);
    return data;
  }

  async updateExpense(updateExpenseDto: UpdateExpenseDto) {
    const supabase = this.supabaseService.getClient();

    const updatePayload = {
      amount: updateExpenseDto.p_amount,
      assigned_user_id: updateExpenseDto.p_assigned_user_id,
      batch_id: updateExpenseDto.p_batch_id,
      batch_name: updateExpenseDto.p_batch_name,
      budget_id: updateExpenseDto.p_budget_id,
      category_id: updateExpenseDto.p_category_id,
      date: updateExpenseDto.p_date,
      description: updateExpenseDto.p_description,
      is_credit: updateExpenseDto.p_is_credit,
      is_recurring: updateExpenseDto.p_is_recurring,
      paid_by: updateExpenseDto.p_paid_by,
      recurrence_end_date: updateExpenseDto.p_recurrence_end_date,
      recurrence_interval: updateExpenseDto.p_recurrence_interval,
      split_method: updateExpenseDto.p_split_method,
    };

    const { data, error } = await supabase
      .from('expenses')
      .update(updatePayload)
      .eq('id', updateExpenseDto.p_expense_id)
      .select()
      .single();

    if (error) throw new InternalServerErrorException(error.message);
    return data;
  }

  async updateRecurringExpense(
    ownerId: string,
    updateRecurringDto: UpdateRecurringExpenseDto,
  ) {
    const supabase = this.supabaseService.getClient();
    const oldExpenseId = updateRecurringDto.p_old_expense_id;

    // 3.1: Obtener el gasto actual.
    const { data: currentExpense, error: fetchError } = await supabase
      .from('expenses')
      .select('*')
      .eq('id', oldExpenseId)
      .single();

    if (fetchError || !currentExpense) {
      throw new NotFoundException(`Expense with id ${oldExpenseId} not found`);
    }

    // 3.2: Ejecutar UPDATE en expenses fijando recurrence_end_date
    const { error: updateError } = await supabase
      .from('expenses')
      .update({ recurrence_end_date: updateRecurringDto.p_cutoff_date })
      .eq('id', oldExpenseId);

    if (updateError)
      throw new InternalServerErrorException(updateError.message);

    // 3.3 & 3.4: Construir nuevo gasto y ejecutar INSERT
    const newExpenseDto = updateRecurringDto.p_new_expense;
    const newExpensePayload: ExpenseInsert = {
      id: newExpenseDto.p_expense_id,
      amount: newExpenseDto.p_amount,
      assigned_user_id: newExpenseDto.p_assigned_user_id,
      batch_id: newExpenseDto.p_batch_id,
      batch_name: newExpenseDto.p_batch_name,
      budget_id: newExpenseDto.p_budget_id,
      category_id: newExpenseDto.p_category_id,
      date: newExpenseDto.p_date,
      description: newExpenseDto.p_description,
      is_credit: newExpenseDto.p_is_credit,
      is_recurring: newExpenseDto.p_is_recurring,
      paid_by: newExpenseDto.p_paid_by,
      recurrence_end_date: null,
      recurrence_interval: newExpenseDto.p_recurrence_interval,
      split_method: newExpenseDto.p_split_method,
      couple_id: currentExpense.couple_id,
      owner_id: ownerId,
    };

    const { data: newExpense, error: insertError } = await supabase
      .from('expenses')
      .insert(newExpensePayload)
      .select()
      .single();

    if (insertError)
      throw new InternalServerErrorException(insertError.message);

    return newExpense;
  }

  async stopRecurringExpense(
    coupleId: string,
    stopRecurringDto: StopRecurringExpenseDto,
  ) {
    const supabase = this.supabaseService.getClient();

    const { data, error } = await supabase
      .from('expenses')
      .update({ recurrence_end_date: stopRecurringDto.p_end_date })
      .eq('id', stopRecurringDto.p_expense_id)
      .eq('couple_id', coupleId)
      .select()
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        throw new NotFoundException(
          'Gasto no encontrado o no tienes permiso para modificarlo',
        );
      }
      throw new InternalServerErrorException(error.message);
    }
    return data;
  }

  async deleteExpensesBatch(
    coupleId: string,
    deleteBatchDto: DeleteExpensesBatchDto,
  ) {
    const supabase = this.supabaseService.getClient();

    const { data, error } = await supabase
      .from('expenses')
      .delete()
      .in('id', deleteBatchDto.p_expense_ids)
      .eq('couple_id', coupleId)
      .select();

    if (error) throw new InternalServerErrorException(error.message);
    return { deleted: data?.length || 0 };
  }

  // --- General CRUD endpoints (Step 6) ---

  /**
   * GET /expenses
   * Lista gastos de la pareja con filtro opcional por mes y año.
   */
  async listExpenses(coupleId: string, month?: number, year?: number) {
    const supabase = this.supabaseService.getClient();

    let query = supabase
      .from('expenses')
      .select('*')
      .eq('couple_id', coupleId)
      .order('date', { ascending: false });

    if (month !== undefined && year !== undefined) {
      const startDate = new Date(year, month - 1, 1).toISOString();
      const endDate = new Date(year, month, 0, 23, 59, 59, 999).toISOString();
      query = query.gte('date', startDate).lte('date', endDate);
    }

    const { data, error } = await query;

    if (error) throw new InternalServerErrorException(error.message);
    return data;
  }

  /**
   * DELETE /expenses/:id
   * Elimina un gasto individual validando que pertenezca a la pareja.
   */
  async deleteExpense(coupleId: string, id: string) {
    const supabase = this.supabaseService.getClient();

    const { data, error } = await supabase
      .from('expenses')
      .delete()
      .eq('id', id)
      .eq('couple_id', coupleId)
      .select()
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        throw new NotFoundException(
          'Gasto no encontrado o sin permiso para eliminarlo',
        );
      }
      throw new InternalServerErrorException(error.message);
    }

    return { deleted: true, id: data?.id };
  }

  // --- Methods for Chatbot Function Calling (RAG) ---

  async getMonthlyExpenses(coupleId: string, year: number, month: number) {
    const supabase = this.supabaseService.getClient();

    // Create date range for the month
    const startDate = new Date(year, month - 1, 1).toISOString();
    const endDate = new Date(year, month, 0, 23, 59, 59, 999).toISOString();

    const { data, error } = await supabase
      .from('expenses')
      .select('*')
      .eq('couple_id', coupleId)
      .gte('date', startDate)
      .lte('date', endDate)
      .order('date', { ascending: false });

    if (error) throw new InternalServerErrorException(error.message);
    return data;
  }

  async getIncomes(coupleId: string, year: number, month: number) {
    const supabase = this.supabaseService.getClient();

    // Create date range for the month
    const startDate = new Date(year, month - 1, 1).toISOString();
    const endDate = new Date(year, month, 0, 23, 59, 59, 999).toISOString();

    const { data, error } = await supabase
      .from('incomes')
      .select('*')
      .eq('couple_id', coupleId)
      .gte('date', startDate)
      .lte('date', endDate);

    if (error) throw new InternalServerErrorException(error.message);
    return data;
  }

  async updateExpenseCategory(
    coupleId: string,
    expenseId: string,
    categoryId: number,
  ) {
    const supabase = this.supabaseService.getClient();

    const { data, error } = await supabase
      .from('expenses')
      .update({ category_id: categoryId })
      .eq('id', expenseId)
      .eq('couple_id', coupleId)
      .select()
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        throw new NotFoundException('Expense not found or unauthorized');
      }
      throw new InternalServerErrorException(error.message);
    }
    return data;
  }
}
