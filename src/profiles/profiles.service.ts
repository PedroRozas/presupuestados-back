import {
  Inject,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common'
import { NodePgDatabase } from 'drizzle-orm/node-postgres'
import { eq } from 'drizzle-orm'
import { DRIZZLE } from '../database/database.module.js'
import * as schema from '../database/schema/index.js'
import { profiles, familyMembers } from '../database/schema/index.js'
import { UpdateProfileDto } from './dto/update-profile.dto.js'

@Injectable()
export class ProfilesService {
  constructor(
    @Inject(DRIZZLE) private readonly db: NodePgDatabase<typeof schema>,
  ) {}

  /**
   * GET /profiles/me
   * Retorna el perfil actual, couple_id y los miembros de la familia.
   */
  async getMyProfile(userId: string) {
    const result = await this.db
      .select()
      .from(profiles)
      .where(eq(profiles.id, userId))
      .limit(1)

    const profile = result[0]

    if (!profile) {
      throw new NotFoundException('Perfil no encontrado')
    }

    let members: schema.FamilyMember[] = []
    if (profile.coupleId) {
      members = await this.db
        .select()
        .from(familyMembers)
        .where(eq(familyMembers.coupleId, profile.coupleId))

      if (!members) {
        throw new InternalServerErrorException('Error al obtener miembros')
      }
    }

    return {
      ...profile,
      family_members: members,
    }
  }

  /**
   * PUT /profiles/me
   * Actualiza nombre, método de división por defecto, avatar, teléfono y onboarding.
   * Sincroniza full_name en family_members si se actualiza.
   */
  async updateMyProfile(userId: string, dto: UpdateProfileDto) {
    const updatePayload: Partial<schema.NewProfile> = {}
    if (dto.full_name !== undefined) updatePayload.fullName = dto.full_name
    if (dto.avatar_url !== undefined) updatePayload.avatarUrl = dto.avatar_url
    if (dto.phone !== undefined) updatePayload.phone = dto.phone
    if (dto.default_split_method !== undefined)
      updatePayload.defaultSplitMethod = dto.default_split_method
    if (dto.has_seen_onboarding !== undefined)
      updatePayload.hasSeenOnboarding = dto.has_seen_onboarding

    const updated = await this.db
      .update(profiles)
      .set(updatePayload)
      .where(eq(profiles.id, userId))
      .returning()

    if (!updated[0]) {
      throw new InternalServerErrorException('Error al actualizar perfil')
    }

    if (dto.full_name !== undefined) {
      await this.db
        .update(familyMembers)
        .set({ name: dto.full_name })
        .where(eq(familyMembers.linkedUserId, userId))
    }

    return updated[0]
  }
}
