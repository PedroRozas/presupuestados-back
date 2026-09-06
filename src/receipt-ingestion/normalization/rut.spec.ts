import { normalizeRut } from './rut.js';

describe('normalizeRut', () => {
  it('elimina puntos, espacios y guiones y pone en mayúsculas', () => {
    expect(normalizeRut('76.123.456-7')).toBe('761234567');
    expect(normalizeRut(' 76123456-k ')).toBe('76123456K');
  });

  it('devuelve null para cadena vacía o null', () => {
    expect(normalizeRut('')).toBeNull();
    expect(normalizeRut(null)).toBeNull();
  });
});
