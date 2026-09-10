/**
 * Receipt lines must arrive in printed order. A negative line discounts the
 * preceding product; quantities and printed unit prices stay unchanged.
 * Unassignable negatives are preserved for review, never silently discarded.
 * Calling this again on net product amounts does not apply discounts twice.
 */
export const applyLineDiscounts = <T extends { amount: number }>(
  lines: readonly T[],
): T[] => {
  const items: T[] = [];
  for (const line of lines) {
    const previous = items.at(-1);
    if (line.amount < 0 && previous && previous.amount + line.amount >= 0) {
      previous.amount += line.amount;
    } else {
      items.push({ ...line });
    }
  }
  return items;
};
