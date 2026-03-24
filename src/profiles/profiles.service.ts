import {
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service.js';
import { UpdateProfileDto } from './dto/update-profile.dto.js';

@Injectable()
export class ProfilesService {
  constructor(private readonly supabaseService: SupabaseService) {}

  /**
   * GET /profiles/me
   * Retorna el perfil actual, couple_id y los miembros de la familia.
   */
  async getMyProfile(userId: string) {
    const supabase = this.supabaseService.getClient();

    // 1. Obtener perfil del usuario
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();

    if (profileError || !profile) {
      throw new NotFoundException('Perfil no encontrado');
    }

    // 2. Si tiene couple_id, obtener los miembros de la familia
    let familyMembers: unknown[] = [];
    if (profile.couple_id) {
      const { data: members, error: membersError } = await supabase
        .from('family_members')
        .select('*')
        .eq('couple_id', profile.couple_id);

      if (membersError) {
        throw new InternalServerErrorException(
          `Error al obtener miembros: ${membersError.message}`,
        );
      }

      familyMembers = members ?? [];
    }

    return {
      ...profile,
      family_members: familyMembers,
    };
  }

  /**
   * PUT /profiles/me
   * Actualiza nombre, método de división por defecto, avatar, teléfono.
   * Sincroniza full_name en family_members si se actualiza.
   * Traducción de update_user_profile_rpc.
   */
  async updateMyProfile(userId: string, dto: UpdateProfileDto) {
    const supabase = this.supabaseService.getClient();

    const updatePayload: Record<string, unknown> = {};
    if (dto.full_name !== undefined) updatePayload['full_name'] = dto.full_name;
    if (dto.avatar_url !== undefined)
      updatePayload['avatar_url'] = dto.avatar_url;
    if (dto.phone !== undefined) updatePayload['phone'] = dto.phone;
    if (dto.default_split_method !== undefined)
      updatePayload['default_split_method'] = dto.default_split_method;

    const { data, error } = await supabase
      .from('profiles')
      .update(updatePayload)
      .eq('id', userId)
      .select()
      .single();

    if (error) {
      throw new InternalServerErrorException(
        `Error al actualizar perfil: ${error.message}`,
      );
    }

    // Sincronizar full_name en family_members (equivalente al RPC)
    if (dto.full_name !== undefined) {
      const { error: memberError } = await supabase
        .from('family_members')
        .update({ name: dto.full_name })
        .eq('linked_user_id', userId);

      if (memberError) {
        throw new InternalServerErrorException(
          `Error al sincronizar nombre en family_members: ${memberError.message}`,
        );
      }
    }

    return data;
  }
}
