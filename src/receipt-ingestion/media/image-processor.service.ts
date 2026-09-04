import { Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { ReceiptConfigService } from '../receipt.config.js';

export interface ProcessedImage {
  buffer: Buffer;
  width: number;
  height: number;
  bytes: number;
  sha256: string;
}

export class ImageDimensionsUnavailableError extends Error {
  constructor() {
    super('image_dimensions_unavailable');
    this.name = 'ImageDimensionsUnavailableError';
  }
}

@Injectable()
export class ImageProcessorService {
  constructor(private readonly config: ReceiptConfigService) {}

  async toWebp(input: Buffer): Promise<ProcessedImage> {
    const { data, info } = await sharp(input)
      .rotate()
      .resize({
        width: this.config.maxWidthPx,
        withoutEnlargement: true,
        fit: 'inside',
      })
      .webp({ quality: this.config.webpQuality })
      .toBuffer({ resolveWithObject: true });

    if (!info.width || !info.height) {
      throw new ImageDimensionsUnavailableError();
    }

    return {
      buffer: data,
      width: info.width,
      height: info.height,
      bytes: data.length,
      sha256: createHash('sha256').update(data).digest('hex'),
    };
  }
}
