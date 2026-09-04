import { buildTextMessageBody } from './whatsapp-message-body.js';

describe('buildTextMessageBody', () => {
  it('arma el body de Graph API con el número sin signo más', () => {
    expect(buildTextMessageBody('+56912345678', 'Hola')).toEqual({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: '56912345678',
      type: 'text',
      text: { preview_url: false, body: 'Hola' },
    });
  });

  it('acepta un número que ya viene sin signo más', () => {
    expect(buildTextMessageBody('56912345678', 'x').to).toBe('56912345678');
  });
});
