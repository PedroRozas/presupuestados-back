import type { ReceiptConfigService } from '../../receipt.config.js';
import { InvalidSenderAddressError } from '../../utils/sender-address.js';
import { TelegramApiError, type FetchLike } from './telegram-media.client.js';
import { TelegramMessagingClient } from './telegram-messaging.client.js';

const config = {
  telegramApiBaseUrl: 'https://tg.test',
  telegramBotToken: 'TOKEN',
} as unknown as ReceiptConfigService;

const buildFetch = (status: number) => {
  const calls: { url: string; body: string }[] = [];
  const fetchImpl = jest.fn((input: string, init?: RequestInit) => {
    calls.push({ url: input, body: String(init?.body as string) });
    return Promise.resolve(new Response('{"ok":true}', { status }));
  }) as unknown as FetchLike;
  return { fetchImpl, calls };
};

describe('TelegramMessagingClient', () => {
  it('envía sendMessage con chat_id numérico y el texto', async () => {
    const { fetchImpl, calls } = buildFetch(200);
    await new TelegramMessagingClient(config, fetchImpl).sendText(
      'tg:123456789',
      'Hola',
    );
    expect(calls[0].url).toBe('https://tg.test/botTOKEN/sendMessage');
    expect(JSON.parse(calls[0].body)).toEqual({
      chat_id: 123456789,
      text: 'Hola',
    });
  });

  it('recorta textos de más de 4096 caracteres', async () => {
    const { fetchImpl, calls } = buildFetch(200);
    await new TelegramMessagingClient(config, fetchImpl).sendText(
      'tg:1',
      'x'.repeat(5000),
    );
    const body = JSON.parse(calls[0].body) as { text: string };
    expect(body.text).toHaveLength(4096);
  });

  it('lanza TelegramApiError cuando la API responde error', async () => {
    const { fetchImpl } = buildFetch(400);
    await expect(
      new TelegramMessagingClient(config, fetchImpl).sendText('tg:1', 'Hola'),
    ).rejects.toBeInstanceOf(TelegramApiError);
  });

  it('rechaza direcciones inválidas antes de llamar a la API', async () => {
    const { fetchImpl, calls } = buildFetch(200);
    await expect(
      new TelegramMessagingClient(config, fetchImpl).sendText('nope', 'Hola'),
    ).rejects.toBeInstanceOf(InvalidSenderAddressError);
    expect(calls).toHaveLength(0);
  });
});
