import { toCanonicalName } from './canonical-name.js';

describe('toCanonicalName', () => {
  it('recorta, colapsa espacios y pasa a mayúsculas', () => {
    expect(toCanonicalName('  leche   entera 1l ')).toBe('LECHE ENTERA 1L');
  });

  it('elimina caracteres de control', () => {
    expect(toCanonicalName('PAN\u0000 MOLDE\t')).toBe('PAN MOLDE');
  });

  it('devuelve vacío si no queda nada', () => {
    expect(toCanonicalName(' \t ')).toBe('');
  });
});
