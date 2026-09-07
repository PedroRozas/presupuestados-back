import { maskPhone } from './mask-phone.js';

describe('maskPhone', () => {
  it('conserva prefijo y últimos cuatro dígitos', () => {
    expect(maskPhone('+56912345678')).toBe('+569****5678');
  });

  it('acepta números sin signo más', () => {
    expect(maskPhone('56912345678')).toBe('+569****5678');
  });

  it('enmascara completo si el número es demasiado corto', () => {
    expect(maskPhone('123')).toBe('****');
  });
});
