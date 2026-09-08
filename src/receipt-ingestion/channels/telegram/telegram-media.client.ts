import { Injectable } from '@nestjs/common';
import { ReceiptConfigService } from '../../receipt.config.js';
import type { DownloadedMedia, MediaClient } from '../media.client.js';

const DEFAULT_MIME_TYPE = 'image/jpeg';

export type FetchLike = typeof fetch;

interface GetFileResponse {
  ok: boolean;
  result?: { file_path?: string };
}

export class TelegramApiError extends Error {
  constructor(method: string, status: number) {
    super(`telegram_${method}_failed status=${status}`);
    this.name = 'TelegramApiError';
  }
}

@Injectable()
export class TelegramMediaClient implements MediaClient {
  constructor(
    private readonly config: ReceiptConfigService,
    private readonly fetchImpl: FetchLike = fetch,
  ) {}

  async download(mediaId: string): Promise<DownloadedMedia> {
    const filePath = await this.resolveFilePath(mediaId);
    const url = `${this.config.telegramApiBaseUrl}/file/bot${this.config.telegramBotToken}/${filePath}`;
    const response = await this.fetchImpl(url);
    if (!response.ok) {
      throw new TelegramApiError('file_download', response.status);
    }
    const buffer = Buffer.from(await response.arrayBuffer());
    return {
      buffer,
      mimeType: response.headers.get('content-type') ?? DEFAULT_MIME_TYPE,
    };
  }

  private async resolveFilePath(fileId: string): Promise<string> {
    const url = `${this.config.telegramApiBaseUrl}/bot${this.config.telegramBotToken}/getFile?file_id=${encodeURIComponent(fileId)}`;
    const response = await this.fetchImpl(url);
    if (!response.ok) {
      throw new TelegramApiError('getFile', response.status);
    }
    const payload = (await response.json()) as GetFileResponse;
    const filePath = payload.result?.file_path;
    if (!payload.ok || !filePath) {
      throw new TelegramApiError('getFile', response.status);
    }
    return filePath;
  }
}
