import { Inject, Injectable, NotFoundException } from '@nestjs/common'
import { NodePgDatabase } from 'drizzle-orm/node-postgres'
import { and, eq } from 'drizzle-orm'
import { randomUUID } from 'crypto'
import { DRIZZLE } from '../database/database.module.js'
import * as schema from '../database/schema/index.js'
import {
  incomes,
  deductions,
  monthlyIncomes,
  monthlyDeductions,
} from '../database/schema/index.js'
import { resolveEffectiveEntries } from './resolve-effective.js'
import { CreateMonthlyEntryDto } from './dto/create-monthly-entry.dto.js'
import { UpdateMonthlyEntryDto } from './dto/update-monthly-entry.dto.js'
import { CoupleContextService } from '../common/services/couple-context.service.js'

type Tx = Parameters<
  Parameters<NodePgDatabase<typeof schema>['transaction']>[0]
>[0]

export type MonthlyType = 'incomes' | 'deductions'

export interface EffectiveEntry {
  id: string
  userId: string
  amount: string
  description: string | null
}

@Injectable()
export class MonthlyFinanceService {
  constructor(
    @Inject(DRIZZLE) private readonly db: NodePgDatabase<typeof schema>,
    private readonly coupleContextService: CoupleContextService,
  ) {}

  async getEffectiveIncomes(
    coupleId: string,
    month: number,
    year: number,
  ): Promise<{ effective: EffectiveEntry[]; personalized: boolean }> {
    const globals = await this.db
      .select({
        id: incomes.id,
        userId: incomes.userId,
        amount: incomes.amount,
        description: incomes.description,
      })
      .from(incomes)
      .where(eq(incomes.coupleId, coupleId))

    const overrides = await this.db
      .select({
        id: monthlyIncomes.id,
        userId: monthlyIncomes.userId,
        amount: monthlyIncomes.amount,
        description: monthlyIncomes.description,
      })
      .from(monthlyIncomes)
      .where(
        and(
          eq(monthlyIncomes.coupleId, coupleId),
          eq(monthlyIncomes.month, month),
          eq(monthlyIncomes.year, year),
        ),
      )

    return resolveEffectiveEntries(globals, overrides)
  }

  async getEffectiveDeductions(
    coupleId: string,
    month: number,
    year: number,
  ): Promise<{ effective: EffectiveEntry[]; personalized: boolean }> {
    const globals = await this.db
      .select({
        id: deductions.id,
        userId: deductions.userId,
        amount: deductions.amount,
        description: deductions.description,
      })
      .from(deductions)
      .where(eq(deductions.coupleId, coupleId))

    const overrides = await this.db
      .select({
        id: monthlyDeductions.id,
        userId: monthlyDeductions.userId,
        amount: monthlyDeductions.amount,
        description: monthlyDeductions.description,
      })
      .from(monthlyDeductions)
      .where(
        and(
          eq(monthlyDeductions.coupleId, coupleId),
          eq(monthlyDeductions.month, month),
          eq(monthlyDeductions.year, year),
        ),
      )

    return resolveEffectiveEntries(globals, overrides)
  }

  async personalize(
    coupleId: string,
    ownerId: string,
    month: number,
    year: number,
    type: MonthlyType | 'both',
  ): Promise<void> {
    await this.db.transaction(async (tx) => {
      const types: MonthlyType[] = type === 'both' ? ['incomes', 'deductions'] : [type]
      for (const t of types) {
        await this.personalizeType(tx, coupleId, ownerId, month, year, t)
      }
    })
  }

  private async personalizeType(
    tx: Tx,
    coupleId: string,
    ownerId: string,
    month: number,
    year: number,
    type: MonthlyType,
  ): Promise<void> {
    if (type === 'incomes') {
      const existing = await tx
        .select()
        .from(monthlyIncomes)
        .where(
          and(
            eq(monthlyIncomes.coupleId, coupleId),
            eq(monthlyIncomes.month, month),
            eq(monthlyIncomes.year, year),
          ),
        )

      if (existing.length > 0) return

      const globals = await tx
        .select({
          userId: incomes.userId,
          amount: incomes.amount,
          description: incomes.description,
        })
        .from(incomes)
        .where(eq(incomes.coupleId, coupleId))

      if (globals.length === 0) return

      await tx.insert(monthlyIncomes).values(
        globals.map((g) => ({
          id: randomUUID(),
          ownerId,
          coupleId,
          userId: g.userId,
          amount: g.amount,
          description: g.description ?? null,
          month,
          year,
        })),
      )
    } else {
      const existing = await tx
        .select()
        .from(monthlyDeductions)
        .where(
          and(
            eq(monthlyDeductions.coupleId, coupleId),
            eq(monthlyDeductions.month, month),
            eq(monthlyDeductions.year, year),
          ),
        )

      if (existing.length > 0) return

      const globals = await tx
        .select({
          userId: deductions.userId,
          amount: deductions.amount,
          description: deductions.description,
        })
        .from(deductions)
        .where(eq(deductions.coupleId, coupleId))

      if (globals.length === 0) return

      await tx.insert(monthlyDeductions).values(
        globals.map((g) => ({
          id: randomUUID(),
          ownerId,
          coupleId,
          userId: g.userId,
          amount: g.amount,
          description: g.description ?? null,
          month,
          year,
        })),
      )
    }
  }

  async reset(
    coupleId: string,
    month: number,
    year: number,
    type: MonthlyType | 'both',
  ): Promise<void> {
    await this.db.transaction(async (tx) => {
      const types: MonthlyType[] = type === 'both' ? ['incomes', 'deductions'] : [type]
      for (const t of types) {
        await this.resetType(tx, coupleId, month, year, t)
      }
    })
  }

  private async resetType(
    tx: Tx,
    coupleId: string,
    month: number,
    year: number,
    type: MonthlyType,
  ): Promise<void> {
    if (type === 'incomes') {
      await tx
        .delete(monthlyIncomes)
        .where(
          and(
            eq(monthlyIncomes.coupleId, coupleId),
            eq(monthlyIncomes.month, month),
            eq(monthlyIncomes.year, year),
          ),
        )
    } else {
      await tx
        .delete(monthlyDeductions)
        .where(
          and(
            eq(monthlyDeductions.coupleId, coupleId),
            eq(monthlyDeductions.month, month),
            eq(monthlyDeductions.year, year),
          ),
        )
    }
  }

  async createEntry(
    coupleId: string,
    ownerId: string,
    type: MonthlyType,
    dto: CreateMonthlyEntryDto,
  ) {
    await this.coupleContextService.assertFamilyMemberIsLinked(
      coupleId,
      dto.user_id,
      'No puedes asignar ingresos/deducciones a una pareja que todavía no está vinculada.',
    )
    if (type === 'incomes') {
      const inserted = await this.db
        .insert(monthlyIncomes)
        .values({
          id: randomUUID(),
          ownerId,
          coupleId,
          userId: dto.user_id,
          amount: String(dto.amount),
          description: dto.description ?? null,
          month: dto.month,
          year: dto.year,
        })
        .returning()
      return inserted[0]
    } else {
      const inserted = await this.db
        .insert(monthlyDeductions)
        .values({
          id: randomUUID(),
          ownerId,
          coupleId,
          userId: dto.user_id,
          amount: String(dto.amount),
          description: dto.description ?? null,
          month: dto.month,
          year: dto.year,
        })
        .returning()
      return inserted[0]
    }
  }

  async updateEntry(
    coupleId: string,
    type: MonthlyType,
    id: string,
    dto: UpdateMonthlyEntryDto,
  ) {
    if (type === 'incomes') {
      const payload: Partial<schema.NewMonthlyIncome> = {}
      if (dto.amount !== undefined) payload.amount = String(dto.amount)
      if (dto.description !== undefined) payload.description = dto.description

      const updated = await this.db
        .update(monthlyIncomes)
        .set(payload)
        .where(and(eq(monthlyIncomes.id, id), eq(monthlyIncomes.coupleId, coupleId)))
        .returning()

      if (!updated[0]) {
        throw new NotFoundException('Entrada mensual no encontrada o sin permiso para modificarla')
      }

      return updated[0]
    } else {
      const payload: Partial<schema.NewMonthlyDeduction> = {}
      if (dto.amount !== undefined) payload.amount = String(dto.amount)
      if (dto.description !== undefined) payload.description = dto.description

      const updated = await this.db
        .update(monthlyDeductions)
        .set(payload)
        .where(and(eq(monthlyDeductions.id, id), eq(monthlyDeductions.coupleId, coupleId)))
        .returning()

      if (!updated[0]) {
        throw new NotFoundException('Entrada mensual no encontrada o sin permiso para modificarla')
      }

      return updated[0]
    }
  }

  async deleteEntry(coupleId: string, type: MonthlyType, id: string) {
    if (type === 'incomes') {
      const deleted = await this.db
        .delete(monthlyIncomes)
        .where(and(eq(monthlyIncomes.id, id), eq(monthlyIncomes.coupleId, coupleId)))
        .returning()

      if (!deleted[0]) {
        throw new NotFoundException('Entrada mensual no encontrada o sin permiso para eliminarla')
      }

      return { deleted: true, id: deleted[0].id }
    } else {
      const deleted = await this.db
        .delete(monthlyDeductions)
        .where(and(eq(monthlyDeductions.id, id), eq(monthlyDeductions.coupleId, coupleId)))
        .returning()

      if (!deleted[0]) {
        throw new NotFoundException('Entrada mensual no encontrada o sin permiso para eliminarla')
      }

      return { deleted: true, id: deleted[0].id }
    }
  }
}
