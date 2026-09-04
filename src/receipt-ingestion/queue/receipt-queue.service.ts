import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { Queue } from 'bullmq';
import IORedis from 'ioredis';
import { ReceiptConfigService } from '../receipt.config.js';
import {
  RECEIPT_CLOSE_COMMAND_JOB_SUFFIX,
  RECEIPT_CLOSE_JOB_ID_PREFIX,
  RECEIPT_FAILED_JOB_RETENTION_SECONDS,
  RECEIPT_JOB,
  RECEIPT_QUEUE_NAME,
} from '../receipt.constants.js';
import type {
  CloseGroupJobPayload,
  IngestImageJobPayload,
  NotifyUserJobPayload,
} from './receipt-queue.constants.js';

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

const stripPlus = (phoneE164: string): string => phoneE164.replace(/^\+/, '');

export const buildCloseGroupJobId = (payload: CloseGroupJobPayload): string =>
  payload.kind === 'window'
    ? `${RECEIPT_CLOSE_JOB_ID_PREFIX}-${payload.groupId}-${payload.pageIndex}`
    : `${RECEIPT_CLOSE_JOB_ID_PREFIX}-${payload.coupleId}-${stripPlus(payload.senderPhoneE164)}-${RECEIPT_CLOSE_COMMAND_JOB_SUFFIX}`;

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

  async enqueueCloseGroup(
    payload: CloseGroupJobPayload,
    delayMs: number,
  ): Promise<void> {
    await this.getQueue().add(RECEIPT_JOB.CLOSE_GROUP, payload, {
      jobId: buildCloseGroupJobId(payload),
      delay: delayMs,
    });
    this.logger.log(
      `job_enqueued name=${RECEIPT_JOB.CLOSE_GROUP} kind=${payload.kind} delayMs=${delayMs}`,
    );
  }

  async enqueueNotifyUser(payload: NotifyUserJobPayload): Promise<void> {
    await this.getQueue().add(RECEIPT_JOB.NOTIFY_USER, payload);
    this.logger.log(`job_enqueued name=${RECEIPT_JOB.NOTIFY_USER}`);
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
