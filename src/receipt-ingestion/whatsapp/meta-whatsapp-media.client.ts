import { Injectable } from '@nestjs/common';
import { ReceiptConfigService } from '../receipt.config.js';
import type {
  DownloadedMedia,
  WhatsAppMediaClient,
} from './whatsapp-media.client.js';

const GRAPH_BASE_URL = 'https://graph.facebook.com';
const DEFAULT_MIME_TYPE = 'application/octet-stream';

interface MediaMetadataResponse {
  url: string;
  mime_type?: string;
}

export class WhatsAppMediaDownloadError extends Error {
  constructor(step: 'metadata' | 'binary', status: number) {
    super(`whatsapp_media_${step}_failed status=${status}`);
    this.name = 'WhatsAppMediaDownloadError';
  }
}

@Injectable()
export class MetaWhatsAppMediaClient implements WhatsAppMediaClient {
  constructor(private readonly config: ReceiptConfigService) {}

  async download(mediaId: string): Promise<DownloadedMedia> {
    const metadata = await this.fetchMetadata(mediaId);
    const response = await fetch(metadata.url, {
      headers: this.authHeaders(),
    });
    if (!response.ok) {
      throw new WhatsAppMediaDownloadError('binary', response.status);
    }
    const buffer = Buffer.from(await response.arrayBuffer());
    return {
      buffer,
      mimeType:
        metadata.mime_type ??
        response.headers.get('content-type') ??
        DEFAULT_MIME_TYPE,
    };
  }

  private async fetchMetadata(mediaId: string): Promise<MediaMetadataResponse> {
    const url = `${GRAPH_BASE_URL}/${this.config.graphApiVersion}/${mediaId}`;
    const response = await fetch(url, { headers: this.authHeaders() });
    if (!response.ok) {
      throw new WhatsAppMediaDownloadError('metadata', response.status);
    }
    return (await response.json()) as MediaMetadataResponse;
  }

  private authHeaders(): Record<string, string> {
    return { Authorization: `Bearer ${this.config.whatsappAccessToken}` };
  }
}
