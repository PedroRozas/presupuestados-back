import { resolveEffectiveEntries } from './resolve-effective';

interface Entry {
  id: string;
  userId: string;
  amount: number;
}

describe('resolveEffectiveEntries', () => {
  const globals: Entry[] = [
    { id: 'g1', userId: 'A', amount: 100 },
    { id: 'g2', userId: 'A', amount: 50 },
    { id: 'g3', userId: 'B', amount: 200 },
  ];

  it('sin overrides usa todos los globales y no está personalizado', () => {
    const { effective, personalized } = resolveEffectiveEntries(globals, []);
    expect(personalized).toBe(false);
    expect(effective).toHaveLength(3);
  });

  it('override de una persona reemplaza solo sus entradas; la otra usa global', () => {
    const overrides: Entry[] = [{ id: 'o1', userId: 'A', amount: 999 }];
    const { effective, personalized } = resolveEffectiveEntries(
      globals,
      overrides,
    );
    expect(personalized).toBe(true);
    const userAEntries = effective.filter((e) => e.userId === 'A');
    const userBEntries = effective.filter((e) => e.userId === 'B');
    expect(userAEntries).toEqual([{ id: 'o1', userId: 'A', amount: 999 }]);
    expect(userBEntries).toEqual([{ id: 'g3', userId: 'B', amount: 200 }]);
  });

  it('override de una persona sin global previo también aparece', () => {
    const overrides: Entry[] = [{ id: 'o2', userId: 'C', amount: 300 }];
    const { effective } = resolveEffectiveEntries(globals, overrides);
    expect(effective.filter((e) => e.userId === 'C')).toEqual([
      { id: 'o2', userId: 'C', amount: 300 },
    ]);
    expect(effective.filter((e) => e.userId === 'A')).toHaveLength(2);
  });
});
