import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service.js';

@Injectable()
export class CouplesService {
  private readonly logger = new Logger(CouplesService.name);

  constructor(private readonly supabaseService: SupabaseService) {}

  /**
   * Vincula al usuario autenticado con una pareja existente mediante su invite_code.
   *
   * Lógica secuencial (reemplaza join_couple_by_code RPC):
   * 1. Buscar couple por invite_code
   * 2. Actualizar couple_id en el profile del usuario
   * 3. Buscar slot familiar vacío (linked_user_id IS NULL)
   * 4. Asignar linked_user_id al slot o insertar nuevo registro
   *
   * REGLA: Los UUIDs para paid_by/assigned_user_id deben venir de family_members.
   */
  async joinCouple(
    userId: string,
    inviteCode: string,
  ): Promise<{ message: string }> {
    const supabase = this.supabaseService.getClient();

    // Paso 2.1 — Buscar la pareja por invite_code
    this.logger.log(`Buscando pareja con invite_code: ${inviteCode}`);
    const { data: couple, error: coupleError } = await supabase
      .from('couples')
      .select('id')
      .eq('invite_code', inviteCode)
      .single();

    if (coupleError || !couple) {
      this.logger.warn(`Código de invitación no encontrado: ${inviteCode}`);
      throw new NotFoundException(
        `El código de invitación '${inviteCode}' no es válido`,
      );
    }

    const coupleId: string = couple.id;
    this.logger.log(`Pareja encontrada: ${coupleId}`);

    // Paso 2.2 — Actualizar el profile del usuario con el couple_id
    const { error: profileError } = await supabase
      .from('profiles')
      .update({ couple_id: coupleId })
      .eq('owner_id', userId);

    if (profileError) {
      this.logger.error(
        `Error actualizando profile del usuario ${userId}: ${profileError.message}`,
      );
      throw new Error(`Error al actualizar perfil: ${profileError.message}`);
    }

    this.logger.log(
      `Profile del usuario ${userId} actualizado con couple_id: ${coupleId}`,
    );

    // Paso 2.3 — Buscar slot familiar vacío (linked_user_id IS NULL)
    const { data: emptySlot, error: slotError } = await supabase
      .from('family_members')
      .select('id')
      .eq('couple_id', coupleId)
      .is('linked_user_id', null)
      .limit(1)
      .maybeSingle();

    if (slotError) {
      this.logger.error(`Error buscando slot familiar: ${slotError.message}`);
      throw new Error(`Error al buscar slot familiar: ${slotError.message}`);
    }

    // Paso 2.4 — Asignar al slot vacío o crear nuevo registro
    if (emptySlot) {
      this.logger.log(
        `Slot vacío encontrado: ${emptySlot.id}. Asignando usuario...`,
      );
      const { error: updateSlotError } = await supabase
        .from('family_members')
        .update({ linked_user_id: userId })
        .eq('id', emptySlot.id);

      if (updateSlotError) {
        this.logger.error(
          `Error asignando usuario al slot: ${updateSlotError.message}`,
        );
        throw new Error(
          `Error al asignar slot familiar: ${updateSlotError.message}`,
        );
      }
    } else {
      this.logger.log(
        `Sin slots vacíos. Insertando nuevo family_member para usuario ${userId}`,
      );
      const { error: insertError } = await supabase
        .from('family_members')
        .insert({
          couple_id: coupleId,
          linked_user_id: userId,
          owner_id: userId,
          name: 'Pareja',
        });

      if (insertError) {
        this.logger.error(
          `Error insertando nuevo family_member: ${insertError.message}`,
        );
        throw new Error(
          `Error al crear miembro familiar: ${insertError.message}`,
        );
      }
    }

    this.logger.log(
      `Usuario ${userId} vinculado exitosamente a la pareja ${coupleId}`,
    );
    return { message: 'Vinculación exitosa' };
  }
}
