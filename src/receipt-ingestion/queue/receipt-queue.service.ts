import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { Queue } from 'bullmq';
import IORedis from 'ioredis';
import { ReceiptConfigService } from '../receipt.config.js';
import {
  RECEIPT_FAILED_JOB_RETENTION_SECONDS,
  RECEIPT_JOB,
  RECEIPT_QUEUE_NAME,
} from '../receipt.constants.js';
import type { IngestImageJobPayload } from './receipt-queue.constants.js';

export const createReceiptRedisConnection = (redisUrl: string): IORedis =>
  new IORedis(redisUrl, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  });

export class ReceiptQueueUnavailableError extends Error {
  constructor() {
    super('receipt_queue_unavailable: REDIS_URL no configurado');
    this.name = 'ReceiptQueueUnavailableError';
  }
}

@Injectable()
export class ReceiptQueueService implements OnModuleDestroy {
  private readonly logger = new Logger(ReceiptQueueService.name);
  private connection?: IORedis;
  private queue?: Queue;

  constructor(private readonly config: ReceiptConfigService) {
    if (!this.config.redisUrl) {
      this.logger.warn('receipt_queue_disabled REDIS_URL no configurado');
    }
  }

  async enqueueIngestImage(payload: IngestImageJobPayload): Promise<void> {
    await this.getQueue().add(RECEIPT_JOB.INGEST_IMAGE, payload);
    this.logger.log(`job_enqueued name=${RECEIPT_JOB.INGEST_IMAGE}`);
  }

  async onModuleDestroy(): Promise<void> {
    await this.queue?.close();
    await this.connection?.quit();
  }

  private getQueue(): Queue {
    if (this.queue) return this.queue;

    const redisUrl = this.config.redisUrl;
    if (!redisUrl) {
      throw new ReceiptQueueUnavailableError();
    }

    this.connection = createReceiptRedisConnection(redisUrl);
    this.queue = new Queue(RECEIPT_QUEUE_NAME, {
      connection: this.connection,
      defaultJobOptions: {
        attempts: this.config.retryAttempts,
        backoff: { type: 'exponential', delay: this.config.retryBackoffMs },
        removeOnComplete: true,
        removeOnFail: { age: RECEIPT_FAILED_JOB_RETENTION_SECONDS },
      },
    });
    return this.queue;
  }
}
