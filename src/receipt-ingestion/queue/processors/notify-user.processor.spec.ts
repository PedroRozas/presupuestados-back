import { NotifyUserProcessor } from './notify-user.processor.js';
import type { WhatsAppMessagingClient } from '../../whatsapp/whatsapp-messaging.client.js';

describe('NotifyUserProcessor', () => {
  it('envía el texto al número indicado', async () => {
    const messaging = {
      sendText: jest.fn(() => Promise.resolve()),
    };
    const processor = new NotifyUserProcessor(
      messaging as unknown as WhatsAppMessagingClient,
    );

    await processor.process({ toPhoneE164: '+56912345678', body: 'Hola' });

    expect(messaging.sendText).toHaveBeenCalledWith('+56912345678', 'Hola');
  });
});
