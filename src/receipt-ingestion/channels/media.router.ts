import { parseSenderAddress } from '../utils/sender-address.js';
import type { DownloadedMedia, MediaClient } from './media.client.js';

export class MediaRouter implements MediaClient {
  constructor(
    private readonly whatsapp: MediaClient,
    private readonly telegram: MediaClient,
  ) {}

  async download(
    mediaId: string,
    senderAddress: string,
  ): Promise<DownloadedMedia> {
    const { channel } = parseSenderAddress(senderAddress);
    const client = channel === 'telegram' ? this.telegram : this.whatsapp;
    return await client.download(mediaId, senderAddress);
  }
}
