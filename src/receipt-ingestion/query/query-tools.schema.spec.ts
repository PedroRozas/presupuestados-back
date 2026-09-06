import {
  categorySpendArgsSchema,
  monthSummaryArgsSchema,
  searchItemsArgsSchema,
  topProductsArgsSchema,
  CATEGORY_SPEND_JSON_SCHEMA,
  MONTH_SUMMARY_JSON_SCHEMA,
  SEARCH_ITEMS_JSON_SCHEMA,
  TOP_PRODUCTS_JSON_SCHEMA,
} from './query-tools.schema.js';

describe('query tool argument schemas', () => {
  it('acepta año y mes válidos', () => {
    expect(monthSummaryArgsSchema.parse({ year: 2026, month: 9 })).toEqual({
      year: 2026,
      month: 9,
    });
  });

  it('rechaza mes fuera de rango y año no entero', () => {
    expect(
      monthSummaryArgsSchema.safeParse({ year: 2026, month: 13 }).success,
    ).toBe(false);
    expect(
      monthSummaryArgsSchema.safeParse({ year: 2026.5, month: 1 }).success,
    ).toBe(false);
  });

  it('acepta limit null y rechaza limit sobre el máximo', () => {
    expect(
      topProductsArgsSchema.parse({ year: 2026, month: 9, limit: null }).limit,
    ).toBeNull();
    expect(
      topProductsArgsSchema.safeParse({ year: 2026, month: 9, limit: 11 })
        .success,
    ).toBe(false);
  });

  it('rechaza fechas inexistentes, from > to y rangos mayores a 366 días', () => {
    const base = { category: 'lacteos_huevos' };
    expect(
      categorySpendArgsSchema.safeParse({
        ...base,
        from: '2026-02-30',
        to: '2026-03-01',
      }).success,
    ).toBe(false);
    expect(
      categorySpendArgsSchema.safeParse({
        ...base,
        from: '2026-03-02',
        to: '2026-03-01',
      }).success,
    ).toBe(false);
    expect(
      categorySpendArgsSchema.safeParse({
        ...base,
        from: '2025-01-01',
        to: '2026-01-03',
      }).success,
    ).toBe(false);
    expect(
      categorySpendArgsSchema.safeParse({
        ...base,
        from: '2026-01-01',
        to: '2026-12-31',
      }).success,
    ).toBe(true);
  });

  it('rechaza categorías fuera de la taxonomía', () => {
    expect(
      categorySpendArgsSchema.safeParse({
        category: 'ropa',
        from: '2026-01-01',
        to: '2026-01-31',
      }).success,
    ).toBe(false);
  });

  it('recorta el texto de búsqueda y exige entre 2 y 80 caracteres', () => {
    expect(
      searchItemsArgsSchema.parse({ text: '  leche ', year: 2026, month: 9 })
        .text,
    ).toBe('leche');
    expect(
      searchItemsArgsSchema.safeParse({ text: 'a', year: 2026, month: 9 })
        .success,
    ).toBe(false);
    expect(
      searchItemsArgsSchema.safeParse({
        text: 'x'.repeat(81),
        year: 2026,
        month: 9,
      }).success,
    ).toBe(false);
  });

  it('los JSON Schema son estrictos: todas las propiedades requeridas y sin adicionales', () => {
    for (const schema of [
      MONTH_SUMMARY_JSON_SCHEMA,
      TOP_PRODUCTS_JSON_SCHEMA,
      CATEGORY_SPEND_JSON_SCHEMA,
      SEARCH_ITEMS_JSON_SCHEMA,
    ]) {
      const properties = schema['properties'] as Record<string, unknown>;
      expect(schema['additionalProperties']).toBe(false);
      expect([...(schema['required'] as string[])].sort()).toEqual(
        Object.keys(properties).sort(),
      );
    }
  });
});
