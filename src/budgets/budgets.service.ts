import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service.js';
import { CreateBudgetDto, BudgetType } from './dto/create-budget.dto.js';
import { UpdateBudgetDto } from './dto/update-budget.dto.js';
import { randomUUID } from 'crypto';

@Injectable()
export class BudgetsService {
  constructor(private readonly supabaseService: SupabaseService) {}

  /**
   * GET /budgets
   * Lista todos los presupuestos de la pareja. Traducción de get_budgets_rpc.
   */
  async getBudgets(coupleId: string) {
    const supabase = this.supabaseService.getClient();

    const { data, error } = await supabase
      .from('budgets')
      .select('*')
      .eq('couple_id', coupleId)
      .order('created_at', { ascending: false });

    if (error) {
      throw new InternalServerErrorException(
        `Error al obtener presupuestos: ${error.message}`,
      );
    }

    return data;
  }

  /**
   * POST /budgets
   * Crea un presupuesto. Traducción de create_budget_rpc.
   */
  async createBudget(coupleId: string, ownerId: string, dto: CreateBudgetDto) {
    const supabase = this.supabaseService.getClient();

    // Validar tipo
    if (!Object.values(BudgetType).includes(dto.type)) {
      throw new BadRequestException('Tipo de presupuesto inválido');
    }

    // Presupuestos individuales requieren user_id
    if (dto.type === BudgetType.INDIVIDUAL && !dto.user_id) {
      throw new BadRequestException(
        'Presupuestos individuales requieren user_id',
      );
    }

    const { data, error } = await supabase
      .from('budgets')
      .insert({
        id: dto.id ?? randomUUID(),
        couple_id: coupleId,
        owner_id: ownerId,
        name: dto.name,
        type: dto.type,
        limit: dto.limit ?? 0,
        user_id: dto.user_id ?? null,
        associated_card: dto.associated_card ?? null,
        default_split_method: dto.default_split_method ?? null,
      })
      .select()
      .single();

    if (error) {
      throw new InternalServerErrorException(
        `Error al crear presupuesto: ${error.message}`,
      );
    }

    return data;
  }

  /**
   * PUT /budgets/:id
   * Actualiza un presupuesto. Traducción de update_budget_rpc.
   * Valida que el presupuesto pertenezca a la pareja del usuario.
   */
  async updateBudget(coupleId: string, id: string, dto: UpdateBudgetDto) {
    const supabase = this.supabaseService.getClient();

    // Verificar que el presupuesto existe y pertenece a la pareja
    const { data: existing, error: fetchError } = await supabase
      .from('budgets')
      .select('couple_id')
      .eq('id', id)
      .single();

    if (fetchError || !existing) {
      throw new NotFoundException('Presupuesto no encontrado');
    }

    if (existing.couple_id !== coupleId) {
      throw new BadRequestException(
        'No tienes permiso para modificar este presupuesto',
      );
    }

    // Validar que presupuesto individual tiene user_id
    if (dto.type === BudgetType.INDIVIDUAL && !dto.user_id) {
      throw new BadRequestException(
        'Presupuestos individuales requieren user_id',
      );
    }

    const updatePayload: Record<string, unknown> = {};
    if (dto.name !== undefined) updatePayload['name'] = dto.name;
    if (dto.type !== undefined) updatePayload['type'] = dto.type;
    if (dto.limit !== undefined) updatePayload['limit'] = dto.limit;
    if (dto.user_id !== undefined) updatePayload['user_id'] = dto.user_id;
    if (dto.associated_card !== undefined)
      updatePayload['associated_card'] = dto.associated_card;
    if (dto.default_split_method !== undefined)
      updatePayload['default_split_method'] = dto.default_split_method;

    const { data, error } = await supabase
      .from('budgets')
      .update(updatePayload)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      throw new InternalServerErrorException(
        `Error al actualizar presupuesto: ${error.message}`,
      );
    }

    return data;
  }

  /**
   * DELETE /budgets/:id
   * Elimina un presupuesto. Traducción de delete_budget_rpc.
   * Desvincula los gastos antes de eliminar para preservar integridad.
   */
  async deleteBudget(coupleId: string, id: string) {
    const supabase = this.supabaseService.getClient();

    // Verificar que el presupuesto existe y pertenece a la pareja
    const { data: budget, error: fetchError } = await supabase
      .from('budgets')
      .select('couple_id')
      .eq('id', id)
      .single();

    if (fetchError || !budget) {
      throw new NotFoundException('Presupuesto no encontrado');
    }

    if (budget.couple_id !== coupleId) {
      throw new BadRequestException(
        'No tienes permiso para eliminar este presupuesto',
      );
    }

    // Desvincular gastos (equivalente al RPC para preservar integridad)
    const { error: unlinkError } = await supabase
      .from('expenses')
      .update({ budget_id: null })
      .eq('budget_id', id);

    if (unlinkError) {
      throw new InternalServerErrorException(
        `Error al desvincular gastos: ${unlinkError.message}`,
      );
    }

    // Eliminar presupuesto
    const { error: deleteError } = await supabase
      .from('budgets')
      .delete()
      .eq('id', id);

    if (deleteError) {
      throw new InternalServerErrorException(
        `Error al eliminar presupuesto: ${deleteError.message}`,
      );
    }

    return { deleted: true, id };
  }
}
