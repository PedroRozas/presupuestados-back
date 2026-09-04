import { Injectable } from '@nestjs/common';
import { SupabaseService } from '../../supabase/supabase.service.js';
import { ReceiptConfigService } from '../receipt.config.js';
import { RECEIPT_IMAGE_CONTENT_TYPE } from '../receipt.constants.js';

export class ReceiptStorageError extends Error {
  constructor(operation: 'upload' | 'sign', detail: string) {
    super(`receipt_storage_${operation}_failed: ${detail}`);
    this.name = 'ReceiptStorageError';
  }
}

@Injectable()
export class ReceiptStorageService {
  constructor(
    private readonly supabase: SupabaseService,
    private readonly config: ReceiptConfigService,
  ) {}

  get bucket(): string {
    return this.config.storageBucket;
  }

  async upload(path: string, buffer: Buffer): Promise<void> {
    const { error } = await this.supabase
      .getClient()
      .storage.from(this.bucket)
      .upload(path, buffer, {
        contentType: RECEIPT_IMAGE_CONTENT_TYPE,
        upsert: true,
      });

    if (error) {
      throw new ReceiptStorageError('upload', error.message);
    }
  }

  async createSignedUrl(path: string): Promise<string> {
    const { data, error } = await this.supabase
      .getClient()
      .storage.from(this.bucket)
      .createSignedUrl(path, this.config.signedUrlTtlSeconds);

    if (error || !data) {
      throw new ReceiptStorageError('sign', error?.message ?? 'sin datos');
    }
    return data.signedUrl;
  }
}
