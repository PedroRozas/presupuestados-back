import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { Queue } from 'bullmq';
import IORedis from 'ioredis';
import { ReceiptConfigService } from '../receipt.config.js';
import { RECEIPT_JOB, RECEIPT_QUEUE_NAME } from '../receipt.constants.js';
import type { IngestImageJobPayload } from './receipt-queue.constants.js';

export const createReceiptRedisConnection = (redisUrl: string): IORedis =>
  new IORedis(redisUrl, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  });

@Injectable()
export class ReceiptQueueService implements OnModuleDestroy {
  private readonly logger = new Logger(ReceiptQueueService.name);
  private readonly connection: IORedis;
  private readonly queue: Queue;

  constructor(private readonly config: ReceiptConfigService) {
    this.connection = createReceiptRedisConnection(this.config.redisUrl);
    this.queue = new Queue(RECEIPT_QUEUE_NAME, {
      connection: this.connection,
      defaultJobOptions: {
        attempts: this.config.retryAttempts,
        backoff: { type: 'exponential', delay: this.config.retryBackoffMs },
        removeOnComplete: true,
        removeOnFail: false,
      },
    });
  }

  async enqueueIngestImage(payload: IngestImageJobPayload): Promise<void> {
    await this.queue.add(RECEIPT_JOB.INGEST_IMAGE, payload, {
      jobId: payload.waMessageId,
    });
    this.logger.log(`job_enqueued name=${RECEIPT_JOB.INGEST_IMAGE}`);
  }

  async onModuleDestroy(): Promise<void> {
    await this.queue.close();
    await this.connection.quit();
  }
}
