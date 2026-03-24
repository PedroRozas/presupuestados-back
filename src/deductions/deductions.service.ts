import {
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service.js';
import { CreateDeductionDto } from './dto/create-deduction.dto.js';
import { UpdateDeductionDto } from './dto/update-deduction.dto.js';
import { randomUUID } from 'crypto';

@Injectable()
export class DeductionsService {
  constructor(private readonly supabaseService: SupabaseService) {}

  /**
   * GET /deductions
   * Lista todas las deducciones de la pareja. Traducción de get_deductions_rpc.
   */
  async getDeductions(coupleId: string) {
    const supabase = this.supabaseService.getClient();

    const { data, error } = await supabase
      .from('deductions')
      .select('*')
      .eq('couple_id', coupleId)
      .order('date', { ascending: false });

    if (error) {
      throw new InternalServerErrorException(
        `Error al obtener deducciones: ${error.message}`,
      );
    }

    return data;
  }

  /**
   * POST /deductions
   * Crea una nueva deducción para la pareja.
   */
  async createDeduction(
    coupleId: string,
    ownerId: string,
    dto: CreateDeductionDto,
  ) {
    const supabase = this.supabaseService.getClient();

    const { data, error } = await supabase

      .from('deductions')
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
        `Error al crear deducción: ${error.message}`,
      );
    }

    return data;
  }

  /**
   * PUT /deductions/:id
   * Actualiza una deducción existente. Valida pertenencia a la pareja.
   */
  async updateDeduction(coupleId: string, id: string, dto: UpdateDeductionDto) {
    const supabase = this.supabaseService.getClient();

    const updatePayload: Record<string, unknown> = {};
    if (dto.amount !== undefined) updatePayload['amount'] = dto.amount;
    if (dto.description !== undefined)
      updatePayload['description'] = dto.description;
    if (dto.date !== undefined) updatePayload['date'] = dto.date;
    if (dto.user_id !== undefined) updatePayload['user_id'] = dto.user_id;

    const { data, error } = await supabase
      .from('deductions')
      .update(updatePayload)
      .eq('id', id)
      .eq('couple_id', coupleId)
      .select()
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        throw new NotFoundException(
          'Deducción no encontrada o sin permiso para modificarla',
        );
      }
      throw new InternalServerErrorException(
        `Error al actualizar deducción: ${error.message}`,
      );
    }

    return data;
  }

  /**
   * DELETE /deductions/:id
   * Elimina una deducción. Valida pertenencia a la pareja.
   */
  async deleteDeduction(coupleId: string, id: string) {
    const supabase = this.supabaseService.getClient();

    const { data, error } = await supabase
      .from('deductions')
      .delete()
      .eq('id', id)
      .eq('couple_id', coupleId)
      .select()
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        throw new NotFoundException(
          'Deducción no encontrada o sin permiso para eliminarla',
        );
      }
      throw new InternalServerErrorException(
        `Error al eliminar deducción: ${error.message}`,
      );
    }

    return { deleted: true, id: data?.id };
  }
}
