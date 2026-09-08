import { InvalidSenderAddressError } from '../utils/sender-address.js';
import type { DownloadedMedia, MediaClient } from './media.client.js';
import { MediaRouter } from './media.router.js';
import type { MessagingClient } from './messaging.client.js';
import { MessagingRouter } from './messaging.router.js';

const media: DownloadedMedia = {
  buffer: Buffer.from('x'),
  mimeType: 'image/jpeg',
};

const buildMediaClient = () => {
  const download = jest.fn<Promise<DownloadedMedia>, [string, string]>(() =>
    Promise.resolve(media),
  );
  const client: MediaClient = { download };
  return { client, download };
};

const buildMessagingClient = () => {
  const sendText = jest.fn<Promise<void>, [string, string]>(() =>
    Promise.resolve(),
  );
  const client: MessagingClient = { sendText };
  return { client, sendText };
};

describe('MediaRouter', () => {
  it('delega en WhatsApp para direcciones E.164', async () => {
    const whatsapp = buildMediaClient();
    const telegram = buildMediaClient();
    await new MediaRouter(whatsapp.client, telegram.client).download(
      'm1',
      '+56957598006',
    );
    expect(whatsapp.download).toHaveBeenCalledWith('m1', '+56957598006');
    expect(telegram.download).not.toHaveBeenCalled();
  });

  it('delega en Telegram para direcciones tg:', async () => {
    const whatsapp = buildMediaClient();
    const telegram = buildMediaClient();
    await new MediaRouter(whatsapp.client, telegram.client).download(
      'f1',
      'tg:42',
    );
    expect(telegram.download).toHaveBeenCalledWith('f1', 'tg:42');
    expect(whatsapp.download).not.toHaveBeenCalled();
  });

  it('propaga InvalidSenderAddressError sin llamar a ningún cliente', () => {
    const whatsapp = buildMediaClient();
    const telegram = buildMediaClient();
    expect(() =>
      new MediaRouter(whatsapp.client, telegram.client).download('m1', 'bad'),
    ).toThrow(InvalidSenderAddressError);
    expect(whatsapp.download).not.toHaveBeenCalled();
  });
});

describe('MessagingRouter', () => {
  it('delega en WhatsApp para direcciones E.164', async () => {
    const whatsapp = buildMessagingClient();
    const telegram = buildMessagingClient();
    await new MessagingRouter(whatsapp.client, telegram.client).sendText(
      '+56957598006',
      'hola',
    );
    expect(whatsapp.sendText).toHaveBeenCalledWith('+56957598006', 'hola');
    expect(telegram.sendText).not.toHaveBeenCalled();
  });

  it('delega en Telegram para direcciones tg:', async () => {
    const whatsapp = buildMessagingClient();
    const telegram = buildMessagingClient();
    await new MessagingRouter(whatsapp.client, telegram.client).sendText(
      'tg:42',
      'hola',
    );
    expect(telegram.sendText).toHaveBeenCalledWith('tg:42', 'hola');
    expect(whatsapp.sendText).not.toHaveBeenCalled();
  });
});
