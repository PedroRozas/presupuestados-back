import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { eq, and, isNull, ne, inArray } from 'drizzle-orm';
import { randomUUID } from 'crypto';
import { DRIZZLE } from '../database/database.module.js';
import * as schema from '../database/schema/index.js';
import {
  profiles,
  partnerRequests,
  familyMembers,
} from '../database/schema/index.js';

@Injectable()
export class PartnerRequestsService {
  private readonly logger = new Logger(PartnerRequestsService.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: NodePgDatabase<typeof schema>,
  ) {}

  async sendInvite(
    userId: string,
    receiverEmail: string,
  ): Promise<{ success: boolean }> {
    // Validar que no se envíe a sí mismo
    const senderResult = await this.db
      .select({ email: profiles.email })
      .from(profiles)
      .where(eq(profiles.id, userId))
      .limit(1);

    if (senderResult[0]?.email === receiverEmail) {
      throw new BadRequestException(
        'No puedes enviarte una invitación a ti mismo',
      );
    }

    // Validar que no haya una invitación pendiente ya existente
    const existing = await this.db
      .select({ id: partnerRequests.id })
      .from(partnerRequests)
      .where(
        and(
          eq(partnerRequests.senderId, userId),
          eq(partnerRequests.receiverEmail, receiverEmail),
          eq(partnerRequests.status, 'pending'),
        ),
      )
      .limit(1);

    if (existing.length > 0) {
      throw new BadRequestException(
        'Ya existe una invitación pendiente para ese email',
      );
    }

    await this.db.insert(partnerRequests).values({
      id: randomUUID(),
      senderId: userId,
      receiverEmail,
      status: 'pending',
    });

    this.logger.log(`Invitación enviada de ${userId} a ${receiverEmail}`);
    return { success: true };
  }

  async getPendingInvites(userEmail: string): Promise<unknown[]> {
    const requests = await this.db
      .select()
      .from(partnerRequests)
      .where(
        and(
          eq(partnerRequests.receiverEmail, userEmail.toLowerCase()),
          eq(partnerRequests.status, 'pending'),
        ),
      );

    if (requests.length === 0) return [];

    const senderIds = requests.map((r) => r.senderId);
    const senderProfiles = await this.db
      .select({
        id: profiles.id,
        email: profiles.email,
        fullName: profiles.fullName,
      })
      .from(profiles)
      .where(inArray(profiles.id, senderIds));

    const profileMap = new Map(senderProfiles.map((p) => [p.id, p]));

    return requests.map((request) => ({
      ...request,
      senderEmail: profileMap.get(request.senderId)?.email ?? null,
      senderFullName: profileMap.get(request.senderId)?.fullName ?? null,
    }));
  }

  async acceptInvite(
    userId: string,
    userEmail: string,
    requestId: string,
  ): Promise<{ success: boolean }> {
    // Buscar la request pendiente, validando que el receiverEmail coincide con quien acepta
    const requestResult = await this.db
      .select()
      .from(partnerRequests)
      .where(
        and(
          eq(partnerRequests.id, requestId),
          eq(partnerRequests.status, 'pending'),
          eq(partnerRequests.receiverEmail, userEmail.toLowerCase()),
        ),
      )
      .limit(1);

    if (requestResult.length === 0) {
      throw new NotFoundException(
        'Invitación no encontrada o ya fue procesada',
      );
    }

    const request = requestResult[0];

    // Obtener couple_id del sender
    const senderProfileResult = await this.db
      .select({ coupleId: profiles.coupleId })
      .from(profiles)
      .where(eq(profiles.id, request.senderId))
      .limit(1);

    const senderCoupleId = senderProfileResult[0]?.coupleId;
    if (!senderCoupleId) {
      throw new BadRequestException(
        'El remitente no pertenece a ninguna pareja',
      );
    }

    // Obtener full_name del usuario actual
    const currentProfileResult = await this.db
      .select({ fullName: profiles.fullName })
      .from(profiles)
      .where(eq(profiles.id, userId))
      .limit(1);

    const fullName = currentProfileResult[0]?.fullName ?? 'Pareja';

    // Actualizar couple_id en el perfil del usuario actual
    await this.db
      .update(profiles)
      .set({ coupleId: senderCoupleId })
      .where(eq(profiles.id, userId));

    // Actualizar la request a aceptada
    await this.db
      .update(partnerRequests)
      .set({ status: 'accepted', receiverId: userId })
      .where(eq(partnerRequests.id, requestId));

    // Buscar slot vacío en family_members (que no sea 'Yo')
    const emptySlotResult = await this.db
      .select({ id: familyMembers.id })
      .from(familyMembers)
      .where(
        and(
          eq(familyMembers.coupleId, senderCoupleId),
          isNull(familyMembers.linkedUserId),
          ne(familyMembers.name, 'Yo'),
        ),
      )
      .limit(1);

    const emptySlot = emptySlotResult[0];

    if (emptySlot) {
      await this.db
        .update(familyMembers)
        .set({ linkedUserId: userId, name: fullName })
        .where(eq(familyMembers.id, emptySlot.id));
    } else {
      await this.db.insert(familyMembers).values({
        id: randomUUID(),
        ownerId: request.senderId,
        coupleId: senderCoupleId,
        name: fullName,
        linkedUserId: userId,
      });
    }

    this.logger.log(`Usuario ${userId} aceptó la invitación ${requestId}`);
    return { success: true };
  }
}
