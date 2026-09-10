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

  it('envía todo el texto largo en mensajes consecutivos sin perder caracteres', async () => {
    const { fetchImpl, calls } = buildFetch(200);
    await new TelegramMessagingClient(config, fetchImpl).sendText(
      'tg:1',
      'x'.repeat(5000),
    );
    const body = JSON.parse(calls[0].body) as { text: string };
    expect(body.text).toHaveLength(4096);
    expect(calls).toHaveLength(2);
    expect(
      calls
        .map((call) => (JSON.parse(call.body) as { text: string }).text)
        .join(''),
    ).toBe('x'.repeat(5000));
  });

  it('divide por líneas y conserva emojis que caen en el límite', async () => {
    const { fetchImpl, calls } = buildFetch(200);
    const text = 'Producto con cantidad y precio\n'.repeat(200);
    await new TelegramMessagingClient(config, fetchImpl).sendText('tg:1', text);
    const chunks = calls.map(
      (call) => (JSON.parse(call.body) as { text: string }).text,
    );
    expect(chunks.join('')).toBe(text);
    expect(chunks.slice(0, -1).every((chunk) => chunk.endsWith('\n'))).toBe(
      true,
    );
    expect(chunks.every((chunk) => chunk.length <= 4096)).toBe(true);
    const emojis = buildFetch(200);
    await new TelegramMessagingClient(config, emojis.fetchImpl).sendText(
      'tg:1',
      'x'.repeat(4095) + '😊fin',
    );
    expect((JSON.parse(emojis.calls[0].body) as { text: string }).text).toBe(
      'x'.repeat(4095),
    );
    expect((JSON.parse(emojis.calls[1].body) as { text: string }).text).toBe(
      '😊fin',
    );
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
