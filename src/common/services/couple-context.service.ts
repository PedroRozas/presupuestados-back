import {
  BadRequestException,
  Inject,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { eq, and } from 'drizzle-orm';
import { DRIZZLE } from '../../database/database.module.js';
import * as schema from '../../database/schema/index.js';
import {
  profiles,
  familyMembers,
  budgets,
} from '../../database/schema/index.js';

interface CoupleContextMessages {
  profileError?: string;
  missingCoupleError?: string;
}

@Injectable()
export class CoupleContextService {
  constructor(
    @Inject(DRIZZLE) private readonly db: NodePgDatabase<typeof schema>,
  ) {}

  async getCoupleIdOrThrow(
    userId: string,
    messages?: CoupleContextMessages,
  ): Promise<string> {
    const result = await this.db
      .select({ coupleId: profiles.coupleId })
      .from(profiles)
      .where(eq(profiles.id, userId))
      .limit(1);

    const profile = result[0];

    if (!profile) {
      throw new InternalServerErrorException(
        messages?.profileError ?? 'Error al obtener el perfil',
      );
    }

    if (!profile.coupleId) {
      throw new NotFoundException(
        messages?.missingCoupleError ?? 'El usuario no pertenece a una pareja',
      );
    }

    return profile.coupleId;
  }

  /**
   * Valida que un family_member pertenece al coupleId dado.
   * Lanza BadRequestException si no pertenece o no existe.
   */
  async assertFamilyMemberBelongsToCouple(
    coupleId: string,
    familyMemberId: string,
  ): Promise<void> {
    const result = await this.db
      .select({ id: familyMembers.id })
      .from(familyMembers)
      .where(
        and(
          eq(familyMembers.id, familyMemberId),
          eq(familyMembers.coupleId, coupleId),
        ),
      )
      .limit(1);

    if (!result[0]) {
      throw new BadRequestException(
        'El miembro familiar no pertenece a tu pareja',
      );
    }
  }

  async assertFamilyMemberIsLinked(
    coupleId: string,
    familyMemberId: string,
    message = 'No puedes asignar datos a una pareja que todavía no está vinculada.',
  ): Promise<void> {
    const result = await this.db
      .select({
        id: familyMembers.id,
        linkedUserId: familyMembers.linkedUserId,
      })
      .from(familyMembers)
      .where(
        and(
          eq(familyMembers.id, familyMemberId),
          eq(familyMembers.coupleId, coupleId),
        ),
      )
      .limit(1);

    const member = result[0];
    if (!member) {
      throw new BadRequestException(
        'El miembro familiar no pertenece a tu pareja',
      );
    }

    if (!member.linkedUserId) {
      throw new BadRequestException({
        code: 'FAMILY_MEMBER_NOT_LINKED',
        message,
      });
    }
  }

  /**
   * Igual que assertFamilyMemberBelongsToCouple pero no hace nada si el ID es null/undefined.
   */
  async assertOptionalFamilyMemberBelongsToCouple(
    coupleId: string,
    familyMemberId?: string | null,
  ): Promise<void> {
    if (!familyMemberId) return;
    await this.assertFamilyMemberBelongsToCouple(coupleId, familyMemberId);
  }

  /**
   * Valida que un budget pertenece al coupleId dado.
   * No hace nada si budgetId es null/undefined.
   */
  async assertOptionalBudgetBelongsToCouple(
    coupleId: string,
    budgetId?: string | null,
  ): Promise<void> {
    if (!budgetId) return;

    const result = await this.db
      .select({ id: budgets.id })
      .from(budgets)
      .where(and(eq(budgets.id, budgetId), eq(budgets.coupleId, coupleId)))
      .limit(1);

    if (!result[0]) {
      throw new BadRequestException('El presupuesto no pertenece a tu pareja');
    }
  }
}
