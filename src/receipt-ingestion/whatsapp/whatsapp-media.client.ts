export const WHATSAPP_MEDIA_CLIENT = Symbol('WHATSAPP_MEDIA_CLIENT');

export interface DownloadedMedia {
  buffer: Buffer;
  mimeType: string;
}

export interface WhatsAppMediaClient {
  download(mediaId: string): Promise<DownloadedMedia>;
}
