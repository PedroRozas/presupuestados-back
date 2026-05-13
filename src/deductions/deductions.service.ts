import {
  Inject,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { eq, and, desc } from 'drizzle-orm';
import { randomUUID } from 'crypto';
import { DRIZZLE } from '../database/database.module.js';
import * as schema from '../database/schema/index.js';
import { deductions } from '../database/schema/index.js';
import { CreateDeductionDto } from './dto/create-deduction.dto.js';
import { UpdateDeductionDto } from './dto/update-deduction.dto.js';
import { CoupleContextService } from '../common/services/couple-context.service.js';

@Injectable()
export class DeductionsService {
  constructor(
    @Inject(DRIZZLE) private readonly db: NodePgDatabase<typeof schema>,
    private readonly coupleContextService: CoupleContextService,
  ) {}

  /**
   * GET /deductions
   * Lista todas las deducciones de la pareja.
   */
  async getDeductions(coupleId: string) {
    return this.db
      .select()
      .from(deductions)
      .where(eq(deductions.coupleId, coupleId))
      .orderBy(desc(deductions.date));
  }

  /**
   * POST /deductions
   */
  async createDeduction(
    coupleId: string,
    ownerId: string,
    dto: CreateDeductionDto,
  ) {
    await this.coupleContextService.assertFamilyMemberIsLinked(
      coupleId,
      dto.user_id,
      'No puedes asignar deducciones a una pareja que todavía no está vinculada.',
    );

    const inserted = await this.db
      .insert(deductions)
      .values({
        id: dto.id ?? randomUUID(),
        userId: dto.user_id,
        coupleId,
        amount: String(dto.amount),
        description: dto.description ?? null,
        date: new Date(dto.date),
        ownerId,
      })
      .returning();

    if (!inserted[0]) {
      throw new InternalServerErrorException('Error al crear deducción');
    }

    return inserted[0];
  }

  /**
   * PUT /deductions/:id
   */
  async updateDeduction(coupleId: string, id: string, dto: UpdateDeductionDto) {
    const updatePayload: Partial<schema.NewDeduction> = {};
    if (dto.amount !== undefined) updatePayload.amount = String(dto.amount);
    if (dto.description !== undefined)
      updatePayload.description = dto.description;
    if (dto.date !== undefined) updatePayload.date = new Date(dto.date);
    if (dto.user_id !== undefined) {
      await this.coupleContextService.assertFamilyMemberIsLinked(
        coupleId,
        dto.user_id,
        'No puedes asignar deducciones a una pareja que todavía no está vinculada.',
      );
      updatePayload.userId = dto.user_id;
    }

    const updated = await this.db
      .update(deductions)
      .set(updatePayload)
      .where(and(eq(deductions.id, id), eq(deductions.coupleId, coupleId)))
      .returning();

    if (!updated[0]) {
      throw new NotFoundException(
        'Deducción no encontrada o sin permiso para modificarla',
      );
    }

    return updated[0];
  }

  /**
   * DELETE /deductions/:id
   */
  async deleteDeduction(coupleId: string, id: string) {
    const deleted = await this.db
      .delete(deductions)
      .where(and(eq(deductions.id, id), eq(deductions.coupleId, coupleId)))
      .returning();

    if (!deleted[0]) {
      throw new NotFoundException(
        'Deducción no encontrada o sin permiso para eliminarla',
      );
    }

    return { deleted: true, id: deleted[0].id };
  }
}
