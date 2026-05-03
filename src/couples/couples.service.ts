import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { eq, isNull, and, ne } from 'drizzle-orm';
import { randomUUID } from 'crypto';
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
    // Paso 2.1 — Buscar la pareja por invite_code
    this.logger.log(`Buscando pareja con invite_code: ${inviteCode}`);
    const coupleResult = await this.db
      .select({ id: couples.id })
      .from(couples)
      .where(eq(couples.inviteCode, inviteCode))
      .limit(1);

    if (coupleResult.length === 0) {
      this.logger.warn(`Código de invitación no encontrado: ${inviteCode}`);
      throw new NotFoundException(
        `El código de invitación '${inviteCode}' no es válido`,
      );
    }

    const coupleId = coupleResult[0].id;
    this.logger.log(`Pareja encontrada: ${coupleId}`);

    // Paso 2.2 — Actualizar el profile del usuario con el couple_id
    await this.db
      .update(profiles)
      .set({ coupleId })
      .where(eq(profiles.id, userId));

    this.logger.log(
      `Profile del usuario ${userId} actualizado con couple_id: ${coupleId}`,
    );

    // Paso 2.3 — Buscar slot familiar vacío (linked_user_id IS NULL)
    const emptySlotResult = await this.db
      .select({ id: familyMembers.id })
      .from(familyMembers)
      .where(
        and(
          eq(familyMembers.coupleId, coupleId),
          isNull(familyMembers.linkedUserId),
        ),
      )
      .limit(1);

    const emptySlot = emptySlotResult[0];

    // Paso 2.4 — Asignar al slot vacío o crear nuevo registro
    if (emptySlot) {
      this.logger.log(
        `Slot vacío encontrado: ${emptySlot.id}. Asignando usuario...`,
      );
      await this.db
        .update(familyMembers)
        .set({ linkedUserId: userId })
        .where(eq(familyMembers.id, emptySlot.id));
    } else {
      this.logger.log(
        `Sin slots vacíos. Insertando nuevo family_member para usuario ${userId}`,
      );
      await this.db.insert(familyMembers).values({
        id: randomUUID(),
        coupleId,
        linkedUserId: userId,
        ownerId: userId,
        name: 'Pareja',
      });
    }

    this.logger.log(
      `Usuario ${userId} vinculado exitosamente a la pareja ${coupleId}`,
    );
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
