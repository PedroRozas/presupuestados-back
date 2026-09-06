import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UpdateGroupDto } from './update-group.dto.js';

describe('UpdateGroupDto', () => {
  it('acepta un patch vacío', async () => {
    const dto = plainToInstance(UpdateGroupDto, {});
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('acepta receiptDate null para limpiar el campo', async () => {
    const dto = plainToInstance(UpdateGroupDto, { receiptDate: null });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('rechaza un receiptDate con formato inválido', async () => {
    const dto = plainToInstance(UpdateGroupDto, { receiptDate: '01-09-2026' });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'receiptDate')).toBe(true);
  });

  it('rechaza merchantRaw más largo que 200 caracteres', async () => {
    const dto = plainToInstance(UpdateGroupDto, {
      merchantRaw: 'a'.repeat(201),
    });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'merchantRaw')).toBe(true);
  });

  it('rechaza totalDeclared negativo', async () => {
    const dto = plainToInstance(UpdateGroupDto, { totalDeclared: -1 });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'totalDeclared')).toBe(true);
  });

  it('rechaza un status fuera de ready/discarded', async () => {
    const dto = plainToInstance(UpdateGroupDto, { status: 'collecting' });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'status')).toBe(true);
  });

  it('acepta status ready y discarded', async () => {
    const readyDto = plainToInstance(UpdateGroupDto, { status: 'ready' });
    const discardedDto = plainToInstance(UpdateGroupDto, {
      status: 'discarded',
    });
    expect(await validate(readyDto)).toHaveLength(0);
    expect(await validate(discardedDto)).toHaveLength(0);
  });
});
