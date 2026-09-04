import { Injectable } from '@nestjs/common';
import { readFile } from 'node:fs/promises';
import { basename, extname, join } from 'node:path';
import { ReceiptConfigService } from '../receipt.config.js';
import type {
  DownloadedMedia,
  WhatsAppMediaClient,
} from './whatsapp-media.client.js';

const MIME_BY_EXTENSION: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
};
const DEFAULT_MIME_TYPE = 'application/octet-stream';

@Injectable()
export class LocalWhatsAppMediaClient implements WhatsAppMediaClient {
  constructor(private readonly config: ReceiptConfigService) {}

  async download(mediaId: string): Promise<DownloadedMedia> {
    const fileName = basename(mediaId);
    const filePath = join(this.config.localMediaDir, fileName);
    const buffer = await readFile(filePath);
    const mimeType =
      MIME_BY_EXTENSION[extname(fileName).toLowerCase()] ?? DEFAULT_MIME_TYPE;
    return { buffer, mimeType };
  }
}
