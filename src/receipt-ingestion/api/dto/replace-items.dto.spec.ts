import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ReplaceItemsDto } from './replace-items.dto.js';

const validItem = {
  descriptionRaw: 'Leche entera 1L',
  category: 'lacteos_huevos',
  qty: 2,
  unitPrice: 1200,
  amount: 2400,
};

describe('ReplaceItemsDto', () => {
  it('acepta una lista de ítems válida', async () => {
    const dto = plainToInstance(ReplaceItemsDto, { items: [validItem] });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('acepta una lista vacía', async () => {
    const dto = plainToInstance(ReplaceItemsDto, { items: [] });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('rechaza más de 300 ítems', async () => {
    const items = Array.from({ length: 301 }, () => validItem);
    const dto = plainToInstance(ReplaceItemsDto, { items });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'items')).toBe(true);
  });

  it('rechaza una categoría fuera del enum', async () => {
    const dto = plainToInstance(ReplaceItemsDto, {
      items: [{ ...validItem, category: 'no_existe' }],
    });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'items')).toBe(true);
  });

  it('rechaza un amount negativo', async () => {
    const dto = plainToInstance(ReplaceItemsDto, {
      items: [{ ...validItem, amount: -100 }],
    });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'items')).toBe(true);
  });

  it('acepta productId como uuid opcional', async () => {
    const dto = plainToInstance(ReplaceItemsDto, {
      items: [
        { ...validItem, productId: '11111111-1111-4111-8111-111111111111' },
      ],
    });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('rechaza un productId que no es uuid', async () => {
    const dto = plainToInstance(ReplaceItemsDto, {
      items: [{ ...validItem, productId: 'not-a-uuid' }],
    });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'items')).toBe(true);
  });
});
