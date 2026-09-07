import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ComparisonQueryDto } from './comparison-query.dto.js';

describe('ComparisonQueryDto', () => {
  it('usa 6 como valor por defecto cuando no se envía months', async () => {
    const dto = plainToInstance(ComparisonQueryDto, {});
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
    expect(dto.months).toBe(6);
  });

  it('acepta months dentro del rango 1-24', async () => {
    const dto = plainToInstance(ComparisonQueryDto, { months: '12' });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
    expect(dto.months).toBe(12);
  });

  it('rechaza months mayor a 24', async () => {
    const dto = plainToInstance(ComparisonQueryDto, { months: '25' });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'months')).toBe(true);
  });

  it('rechaza months menor a 1', async () => {
    const dto = plainToInstance(ComparisonQueryDto, { months: '0' });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'months')).toBe(true);
  });
});
