export const resolveEffectiveEntries = <T extends { userId: string }>(
  globalEntries: T[],
  overrideEntries: T[],
): { effective: T[]; personalized: boolean } => {
  const overrideByUser = new Map<string, T[]>();
  for (const entry of overrideEntries) {
    const list = overrideByUser.get(entry.userId) ?? [];
    list.push(entry);
    overrideByUser.set(entry.userId, list);
  }

  const usersWithGlobal = new Set(globalEntries.map((e) => e.userId));
  const allUserIds = new Set<string>([
    ...usersWithGlobal,
    ...overrideByUser.keys(),
  ]);

  const effective: T[] = [];
  for (const userId of allUserIds) {
    const overrides = overrideByUser.get(userId);
    if (overrides) {
      effective.push(...overrides);
    } else {
      effective.push(...globalEntries.filter((e) => e.userId === userId));
    }
  }

  return { effective, personalized: overrideEntries.length > 0 };
};
