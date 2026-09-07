import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { MonthQueryDto } from './month-query.dto.js';

describe('MonthQueryDto', () => {
  it('acepta un mes y año válidos convertidos desde query string', async () => {
    const dto = plainToInstance(MonthQueryDto, { month: '9', year: '2026' });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
    expect(dto.month).toBe(9);
    expect(dto.year).toBe(2026);
  });

  it('rechaza un mes fuera de rango', async () => {
    const dto = plainToInstance(MonthQueryDto, { month: '13', year: '2026' });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'month')).toBe(true);
  });

  it('rechaza un mes menor a 1', async () => {
    const dto = plainToInstance(MonthQueryDto, { month: '0', year: '2026' });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'month')).toBe(true);
  });

  it('rechaza un año mayor a 2100', async () => {
    const dto = plainToInstance(MonthQueryDto, {
      month: '9',
      year: '99999999',
    });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'year')).toBe(true);
  });

  it('rechaza un año menor a 2000', async () => {
    const dto = plainToInstance(MonthQueryDto, { month: '9', year: '1999' });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'year')).toBe(true);
  });
});
