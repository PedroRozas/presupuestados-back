import sharp from 'sharp';
import { ImageProcessorService } from './image-processor.service.js';
import type { ReceiptConfigService } from '../receipt.config.js';

const buildJpeg = async (
  width: number,
  height: number,
  orientation?: number,
) => {
  const pipeline = sharp({
    create: {
      width,
      height,
      channels: 3,
      background: { r: 200, g: 200, b: 200 },
    },
  }).jpeg();
  return orientation
    ? pipeline.withMetadata({ orientation }).toBuffer()
    : pipeline.toBuffer();
};

describe('ImageProcessorService', () => {
  const config = { webpQuality: 90, maxWidthPx: 1000 } as ReceiptConfigService;
  const service = new ImageProcessorService(config);

  it('convierte a webp y calcula sha256 y dimensiones', async () => {
    const input = await buildJpeg(400, 300);

    const result = await service.toWebp(input);

    const meta = await sharp(result.buffer).metadata();
    expect(meta.format).toBe('webp');
    expect(result.width).toBe(400);
    expect(result.height).toBe(300);
    expect(result.bytes).toBe(result.buffer.length);
    expect(result.sha256).toMatch(/^[a-f0-9]{64}$/);
  });

  it('reduce el ancho al máximo configurado manteniendo proporción', async () => {
    const input = await buildJpeg(2000, 1000);

    const result = await service.toWebp(input);

    expect(result.width).toBe(1000);
    expect(result.height).toBe(500);
  });

  it('no agranda imágenes más chicas que el máximo', async () => {
    const input = await buildJpeg(300, 300);

    const result = await service.toWebp(input);

    expect(result.width).toBe(300);
  });

  it('aplica la orientación EXIF y elimina los metadatos', async () => {
    const input = await buildJpeg(400, 200, 6);

    const result = await service.toWebp(input);

    const meta = await sharp(result.buffer).metadata();
    expect(result.width).toBe(200);
    expect(result.height).toBe(400);
    expect(meta.exif).toBeUndefined();
    expect(meta.orientation).toBeUndefined();
  });

  it('produce el mismo hash para la misma entrada', async () => {
    const input = await buildJpeg(100, 100);

    const first = await service.toWebp(input);
    const second = await service.toWebp(input);

    expect(first.sha256).toBe(second.sha256);
  });
});
