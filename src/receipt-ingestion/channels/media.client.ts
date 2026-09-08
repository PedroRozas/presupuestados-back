export const MEDIA_CLIENT = Symbol('MEDIA_CLIENT');

export interface DownloadedMedia {
  buffer: Buffer;
  mimeType: string;
}

export interface MediaClient {
  download(mediaId: string, senderAddress: string): Promise<DownloadedMedia>;
}
