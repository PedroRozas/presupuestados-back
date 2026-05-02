import { Inject, Injectable } from '@nestjs/common';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { asc } from 'drizzle-orm';
import { DRIZZLE } from '../database/database.module.js';
import * as schema from '../database/schema/index.js';
import { expenseCategories } from '../database/schema/index.js';

@Injectable()
export class CategoriesService {
  constructor(
    @Inject(DRIZZLE) private readonly db: NodePgDatabase<typeof schema>,
  ) {}

  async findAll() {
    return this.db
      .select({
        id: expenseCategories.id,
        name: expenseCategories.name,
      })
      .from(expenseCategories)
      .orderBy(asc(expenseCategories.id));
  }
}
