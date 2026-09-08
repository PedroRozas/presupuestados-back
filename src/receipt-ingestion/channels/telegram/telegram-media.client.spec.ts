import type { ReceiptConfigService } from '../../receipt.config.js';
import {
  TelegramApiError,
  TelegramMediaClient,
  type FetchLike,
} from './telegram-media.client.js';

const config = {
  telegramApiBaseUrl: 'https://tg.test',
  telegramBotToken: 'TOKEN',
} as unknown as ReceiptConfigService;

const jsonResponse = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });

const binaryResponse = (status: number, contentType?: string): Response =>
  new Response(Buffer.from('img'), {
    status,
    headers: contentType ? { 'content-type': contentType } : {},
  });

const buildFetch = (responses: Response[]) => {
  const calls: string[] = [];
  const fetchImpl = jest.fn((input: string) => {
    calls.push(input);
    const next = responses.shift();
    if (!next) throw new Error('unexpected fetch');
    return Promise.resolve(next);
  }) as unknown as FetchLike;
  return { fetchImpl, calls };
};

describe('TelegramMediaClient', () => {
  it('resuelve el file_path con getFile y descarga el binario', async () => {
    const { fetchImpl, calls } = buildFetch([
      jsonResponse(200, { ok: true, result: { file_path: 'photos/a.jpg' } }),
      binaryResponse(200, 'image/jpeg'),
    ]);
    const client = new TelegramMediaClient(config, fetchImpl);

    const media = await client.download('file-1', 'tg:1');

    expect(calls).toEqual([
      'https://tg.test/botTOKEN/getFile?file_id=file-1',
      'https://tg.test/file/botTOKEN/photos/a.jpg',
    ]);
    expect(media.mimeType).toBe('image/jpeg');
    expect(media.buffer.toString()).toBe('img');
  });

  it('usa image/jpeg cuando la descarga no trae content-type', async () => {
    const { fetchImpl } = buildFetch([
      jsonResponse(200, { ok: true, result: { file_path: 'p.jpg' } }),
      binaryResponse(200),
    ]);
    const media = await new TelegramMediaClient(config, fetchImpl).download(
      'file-1',
      'tg:1',
    );
    expect(media.mimeType).toBe('image/jpeg');
  });

  it('lanza TelegramApiError si getFile falla', async () => {
    const { fetchImpl } = buildFetch([jsonResponse(404, { ok: false })]);
    await expect(
      new TelegramMediaClient(config, fetchImpl).download('file-1', 'tg:1'),
    ).rejects.toBeInstanceOf(TelegramApiError);
  });

  it('lanza TelegramApiError si la descarga falla', async () => {
    const { fetchImpl } = buildFetch([
      jsonResponse(200, { ok: true, result: { file_path: 'p.jpg' } }),
      binaryResponse(500),
    ]);
    await expect(
      new TelegramMediaClient(config, fetchImpl).download('file-1', 'tg:1'),
    ).rejects.toThrow('telegram_file_download_failed status=500');
  });
});
