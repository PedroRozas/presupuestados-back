import {
  InvalidSenderAddressError,
  maskSenderAddress,
  parseSenderAddress,
  telegramAddress,
} from './sender-address.js';

describe('parseSenderAddress', () => {
  it('reconoce un teléfono E.164 como WhatsApp', () => {
    expect(parseSenderAddress('+56957598006')).toEqual({
      channel: 'whatsapp',
      id: '+56957598006',
    });
  });

  it('reconoce el prefijo tg: como Telegram y devuelve el id sin prefijo', () => {
    expect(parseSenderAddress('tg:123456789')).toEqual({
      channel: 'telegram',
      id: '123456789',
    });
  });

  it.each(['56957598006', 'tg:', 'tg:abc', '', '+0123', 'wa:+569'])(
    'rechaza la dirección inválida %p',
    (address) => {
      expect(() => parseSenderAddress(address)).toThrow(
        InvalidSenderAddressError,
      );
    },
  );
});

describe('telegramAddress', () => {
  it('construye la dirección a partir del id numérico', () => {
    expect(telegramAddress(987654321)).toBe('tg:987654321');
  });
});

describe('maskSenderAddress', () => {
  it('enmascara los teléfonos dejando prefijo y sufijo', () => {
    expect(maskSenderAddress('+56957598006')).toBe('+569****8006');
  });

  it('enmascara por completo un teléfono demasiado corto', () => {
    expect(maskSenderAddress('+1234567')).toBe('****');
  });

  it('devuelve completa una dirección de Telegram', () => {
    expect(maskSenderAddress('tg:123456789')).toBe('tg:123456789');
  });

  it('no lanza con una dirección inválida', () => {
    expect(maskSenderAddress('garbage')).toBe('****');
  });
});
