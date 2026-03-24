import {
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service.js';
import { CreateIncomeDto } from './dto/create-income.dto.js';
import { UpdateIncomeDto } from './dto/update-income.dto.js';
import { randomUUID } from 'crypto';

@Injectable()
export class IncomesService {
  constructor(private readonly supabaseService: SupabaseService) {}

  /**
   * GET /incomes
   * Lista todos los ingresos de la pareja. Traducción de get_incomes_rpc.
   */
  async getIncomes(coupleId: string) {
    const supabase = this.supabaseService.getClient();

    const { data, error } = await supabase
      .from('incomes')
      .select('*')
      .eq('couple_id', coupleId)
      .order('date', { ascending: false });

    if (error) {
      throw new InternalServerErrorException(
        `Error al obtener ingresos: ${error.message}`,
      );
    }

    return data;
  }

  /**
   * POST /incomes
   * Crea un nuevo ingreso para la pareja.
   *
   */
  async createIncome(coupleId: string, ownerId: string, dto: CreateIncomeDto) {
    const supabase = this.supabaseService.getClient();

    const { data, error } = await supabase
      .from('incomes')
      .insert({
        id: dto.id ?? randomUUID(),
        user_id: dto.user_id,
        couple_id: coupleId,
        amount: dto.amount,
        description: dto.description ?? null,
        date: dto.date,
        owner_id: ownerId,
      })
      .select()
      .single();

    if (error) {
      throw new InternalServerErrorException(
        `Error al crear ingreso: ${error.message}`,
      );
    }

    return data;
  }

  /**
   * PUT /incomes/:id
   * Actualiza un ingreso existente. Valida que pertenezca a la pareja.
   */
  async updateIncome(coupleId: string, id: string, dto: UpdateIncomeDto) {
    const supabase = this.supabaseService.getClient();

    const updatePayload: Record<string, unknown> = {};
    if (dto.amount !== undefined) updatePayload['amount'] = dto.amount;
    if (dto.description !== undefined)
      updatePayload['description'] = dto.description;
    if (dto.date !== undefined) updatePayload['date'] = dto.date;
    if (dto.user_id !== undefined) updatePayload['user_id'] = dto.user_id;

    const { data, error } = await supabase
      .from('incomes')
      .update(updatePayload)
      .eq('id', id)
      .eq('couple_id', coupleId)
      .select()
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        throw new NotFoundException(
          'Ingreso no encontrado o sin permiso para modificarlo',
        );
      }
      throw new InternalServerErrorException(
        `Error al actualizar ingreso: ${error.message}`,
      );
    }

    return data;
  }

  /**
   * DELETE /incomes/:id
   * Elimina un ingreso. Valida que pertenezca a la pareja.
   */
  async deleteIncome(coupleId: string, id: string) {
    const supabase = this.supabaseService.getClient();

    const { data, error } = await supabase
      .from('incomes')
      .delete()
      .eq('id', id)
      .eq('couple_id', coupleId)
      .select()
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        throw new NotFoundException(
          'Ingreso no encontrado o sin permiso para eliminarlo',
        );
      }
      throw new InternalServerErrorException(
        `Error al eliminar ingreso: ${error.message}`,
      );
    }

    return { deleted: true, id: data?.id };
  }
}
