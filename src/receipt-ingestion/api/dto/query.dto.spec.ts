import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { QueryDto } from './query.dto.js';

describe('QueryDto', () => {
  it('acepta una pregunta de largo válido', async () => {
    const dto = plainToInstance(QueryDto, { message: '¿cuánto gasté?' });
    expect(await validate(dto)).toHaveLength(0);
  });

  it('rechaza mensajes vacíos, de un carácter o mayores a 500', async () => {
    for (const message of ['', 'a', 'x'.repeat(501), 42]) {
      const dto = plainToInstance(QueryDto, { message });
      const errors = await validate(dto);
      expect(errors.some((e) => e.property === 'message')).toBe(true);
    }
  });
});
