import { Inject, Injectable } from '@nestjs/common';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { eq } from 'drizzle-orm';
import { DRIZZLE } from '../database/database.module.js';
import * as schema from '../database/schema/index.js';
import { profiles, familyMembers } from '../database/schema/index.js';

@Injectable()
export class FamilyMembersService {
  constructor(
    @Inject(DRIZZLE) private readonly db: NodePgDatabase<typeof schema>,
  ) {}

  async findAll(userId: string) {
    const profileResult = await this.db
      .select({ coupleId: profiles.coupleId })
      .from(profiles)
      .where(eq(profiles.id, userId))
      .limit(1);

    const coupleId = profileResult[0]?.coupleId;
    if (!coupleId) return [];

    return this.db
      .select()
      .from(familyMembers)
      .where(eq(familyMembers.coupleId, coupleId));
  }
}
