import {
  Inject,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common'
import { NodePgDatabase } from 'drizzle-orm/node-postgres'
import { eq, and, desc } from 'drizzle-orm'
import { randomUUID } from 'crypto'
import { DRIZZLE } from '../database/database.module.js'
import * as schema from '../database/schema/index.js'
import { incomes } from '../database/schema/index.js'
import { CreateIncomeDto } from './dto/create-income.dto.js'
import { UpdateIncomeDto } from './dto/update-income.dto.js'

@Injectable()
export class IncomesService {
  constructor(
    @Inject(DRIZZLE) private readonly db: NodePgDatabase<typeof schema>,
  ) {}

  /**
   * GET /incomes
   * Lista todos los ingresos de la pareja.
   */
  async getIncomes(coupleId: string) {
    return this.db
      .select()
      .from(incomes)
      .where(eq(incomes.coupleId, coupleId))
      .orderBy(desc(incomes.date))
  }

  /**
   * POST /incomes
   */
  async createIncome(coupleId: string, ownerId: string, dto: CreateIncomeDto) {
    const inserted = await this.db
      .insert(incomes)
      .values({
        id: dto.id ?? randomUUID(),
        userId: dto.user_id,
        coupleId,
        amount: String(dto.amount),
        description: dto.description ?? null,
        date: new Date(dto.date),
        ownerId,
      })
      .returning()

    if (!inserted[0]) {
      throw new InternalServerErrorException('Error al crear ingreso')
    }

    return inserted[0]
  }

  /**
   * PUT /incomes/:id
   */
  async updateIncome(coupleId: string, id: string, dto: UpdateIncomeDto) {
    const updatePayload: Partial<schema.NewIncome> = {}
    if (dto.amount !== undefined) updatePayload.amount = String(dto.amount)
    if (dto.description !== undefined) updatePayload.description = dto.description
    if (dto.date !== undefined) updatePayload.date = new Date(dto.date)
    if (dto.user_id !== undefined) updatePayload.userId = dto.user_id

    const updated = await this.db
      .update(incomes)
      .set(updatePayload)
      .where(and(eq(incomes.id, id), eq(incomes.coupleId, coupleId)))
      .returning()

    if (!updated[0]) {
      throw new NotFoundException(
        'Ingreso no encontrado o sin permiso para modificarlo',
      )
    }

    return updated[0]
  }

  /**
   * DELETE /incomes/:id
   */
  async deleteIncome(coupleId: string, id: string) {
    const deleted = await this.db
      .delete(incomes)
      .where(and(eq(incomes.id, id), eq(incomes.coupleId, coupleId)))
      .returning()

    if (!deleted[0]) {
      throw new NotFoundException(
        'Ingreso no encontrado o sin permiso para eliminarlo',
      )
    }

    return { deleted: true, id: deleted[0].id }
  }
}
