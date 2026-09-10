import { applyLineDiscounts } from './apply-line-discounts.js';

describe('applyLineDiscounts', () => {
  it('conserva los 83665 de las 30 líneas de Lider en 27 productos netos', () => {
    const amounts = [
      5500, -1500, 7500, 3490, 750, 750, 750, 1180, 3500, 3380, 2000, 2360,
      -360, 2780, 3300, 1290, 860, 2850, 3000, 2490, 6914, 2780, 5650, 2000,
      450, 1350, 12871, 6390, -1400, 790,
    ];
    const result = applyLineDiscounts(amounts.map((amount) => ({ amount })));
    expect(result).toHaveLength(27);
    expect(result[0].amount).toBe(4000);
    expect(result[10].amount).toBe(2000);
    expect(result[25].amount).toBe(4990);
    expect(result.reduce((sum, item) => sum + item.amount, 0)).toBe(83665);
    expect(result.every((item) => item.amount >= 0)).toBe(true);
  });

  it('aplica descuentos consecutivos al mismo producto sin cambiar cantidades ni agrupar compras repetidas', () => {
    const lines = [
      { name: 'Cola', amount: 5500, qty: 2, unitPrice: 2750 },
      { name: 'RF Lleve N x', amount: -1000, qty: null, unitPrice: null },
      { name: 'RF Descuento', amount: -500, qty: null, unitPrice: null },
      { name: 'Cola', amount: 2750, qty: 1, unitPrice: 2750 },
    ];
    const result = applyLineDiscounts(lines);
    expect(result).toEqual([
      { name: 'Cola', amount: 4000, qty: 2, unitPrice: 2750 },
      { name: 'Cola', amount: 2750, qty: 1, unitPrice: 2750 },
    ]);
    expect(lines[0].amount).toBe(5500);
    expect(applyLineDiscounts(result)).toEqual(result);
  });

  it('permite un descuento del 100% y no descuenta de otro producto si excede al anterior', () => {
    expect(
      applyLineDiscounts([
        { amount: 2000 },
        { amount: 100 },
        { amount: -100 },
        { amount: -50 },
      ]),
    ).toEqual([{ amount: 2000 }, { amount: 0 }, { amount: -50 }]);
  });

  it('conserva descuentos huérfanos, compras sin cantidad y listas vacías', () => {
    expect(
      applyLineDiscounts([{ amount: -500 }, { amount: 2000, qty: null }]),
    ).toEqual([{ amount: -500 }, { amount: 2000, qty: null }]);
    expect(applyLineDiscounts([])).toEqual([]);
  });
});
