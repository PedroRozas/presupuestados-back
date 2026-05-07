import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { eq, isNull, and, ne, isNotNull } from 'drizzle-orm';
import { DRIZZLE } from '../database/database.module.js';
import * as schema from '../database/schema/index.js';
import { couples, profiles, familyMembers } from '../database/schema/index.js';

@Injectable()
export class CouplesService {
  private readonly logger = new Logger(CouplesService.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: NodePgDatabase<typeof schema>,
  ) {}

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
    const normalizedInviteCode = inviteCode.trim().toUpperCase();
    if (!normalizedInviteCode) {
      throw new BadRequestException({
        code: 'INVITE_CODE_REQUIRED',
        message: 'El código de invitación no puede estar vacío',
      });
    }

    await this.db.transaction(async (tx) => {
      this.logger.log(
        `Buscando pareja con invite_code: ${normalizedInviteCode}`,
      );

      const [profile] = await tx
        .select({
          id: profiles.id,
          coupleId: profiles.coupleId,
          fullName: profiles.fullName,
        })
        .from(profiles)
        .where(eq(profiles.id, userId))
        .limit(1);

      if (!profile) {
        throw new NotFoundException('Perfil no encontrado');
      }

      const [couple] = await tx
        .select({ id: couples.id })
        .from(couples)
        .where(eq(couples.inviteCode, normalizedInviteCode))
        .limit(1);

      if (!couple) {
        this.logger.warn(
          `Código de invitación no encontrado: ${normalizedInviteCode}`,
        );
        throw new NotFoundException({
          code: 'INVITE_CODE_INVALID',
          message: `El código de invitación '${normalizedInviteCode}' no es válido`,
        });
      }

      if (profile.coupleId === couple.id) {
        throw new ConflictException({
          code: 'INVITE_CODE_OWN_COUPLE',
          message: 'Ya perteneces a la pareja asociada a este código.',
        });
      }

      if (profile.coupleId) {
        throw new ConflictException({
          code: 'USER_ALREADY_LINKED',
          message:
            'Tu cuenta ya está vinculada a una pareja. Debes desvincularte antes de usar otro código.',
        });
      }

      const linkedMembers = await tx
        .select({ id: familyMembers.id })
        .from(familyMembers)
        .where(
          and(
            eq(familyMembers.coupleId, couple.id),
            isNotNull(familyMembers.linkedUserId),
          ),
        );

      if (linkedMembers.length >= 2) {
        throw new ConflictException({
          code: 'COUPLE_ALREADY_FULL',
          message:
            'Este código ya fue usado por otra cuenta. Pide a tu pareja revisar su vínculo.',
        });
      }

      const [emptySlot] = await tx
        .select({ id: familyMembers.id })
        .from(familyMembers)
        .where(
          and(
            eq(familyMembers.coupleId, couple.id),
            isNull(familyMembers.linkedUserId),
          ),
        )
        .limit(1);

      if (!emptySlot) {
        throw new ConflictException({
          code: 'COUPLE_ALREADY_FULL',
          message:
            'Este código ya fue usado por otra cuenta. Pide a tu pareja revisar su vínculo.',
        });
      }

      const displayName = profile.fullName?.trim() || 'Pareja';
      const updatedSlot = await tx
        .update(familyMembers)
        .set({
          linkedUserId: userId,
          ownerId: userId,
          name: displayName,
        })
        .where(
          and(
            eq(familyMembers.id, emptySlot.id),
            isNull(familyMembers.linkedUserId),
          ),
        )
        .returning({ id: familyMembers.id });

      if (!updatedSlot[0]) {
        throw new ConflictException({
          code: 'COUPLE_ALREADY_FULL',
          message:
            'Este código acaba de ser usado por otra cuenta. Pide a tu pareja revisar su vínculo.',
        });
      }

      await tx
        .update(profiles)
        .set({ coupleId: couple.id })
        .where(eq(profiles.id, userId));

      this.logger.log(
        `Usuario ${userId} vinculado exitosamente a la pareja ${couple.id}`,
      );
    });

    return { message: 'Vinculación exitosa' };
  }

  async getLinkedPartnerEmail(
    userId: string,
  ): Promise<{ email: string | null }> {
    const profileResult = await this.db
      .select({ coupleId: profiles.coupleId })
      .from(profiles)
      .where(eq(profiles.id, userId))
      .limit(1);

    const coupleId = profileResult[0]?.coupleId;
    if (!coupleId) return { email: null };

    const partnerResult = await this.db
      .select({ email: profiles.email })
      .from(profiles)
      .where(and(eq(profiles.coupleId, coupleId), ne(profiles.id, userId)))
      .limit(1);

    return { email: partnerResult[0]?.email ?? null };
  }

  async getMyCouple(
    userId: string,
  ): Promise<{ id: string; inviteCode: string }> {
    const profileResult = await this.db
      .select({ coupleId: profiles.coupleId })
      .from(profiles)
      .where(eq(profiles.id, userId))
      .limit(1);

    const coupleId = profileResult[0]?.coupleId;
    if (!coupleId) {
      throw new NotFoundException('El usuario no pertenece a una pareja');
    }

    const coupleResult = await this.db
      .select({ id: couples.id, inviteCode: couples.inviteCode })
      .from(couples)
      .where(eq(couples.id, coupleId))
      .limit(1);

    const couple = coupleResult[0];
    if (!couple) {
      throw new NotFoundException('Pareja no encontrada');
    }

    return couple;
  }
}
