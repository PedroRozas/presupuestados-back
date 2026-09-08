import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { Queue } from 'bullmq';
import IORedis from 'ioredis';
import { ReceiptConfigService } from '../receipt.config.js';
import {
  RECEIPT_CLOSE_COMMAND_JOB_SUFFIX,
  RECEIPT_CLOSE_JOB_ID_PREFIX,
  RECEIPT_CLOSE_RESCHEDULE_JOB_SUFFIX,
  RECEIPT_FAILED_JOB_RETENTION_SECONDS,
  RECEIPT_JOB,
  RECEIPT_QUEUE_NAME,
} from '../receipt.constants.js';
import type {
  AnswerQueryJobPayload,
  CloseGroupJobPayload,
  ExtractGroupJobPayload,
  IngestImageJobPayload,
  NormalizeGroupJobPayload,
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

const MILLISECONDS_PER_MINUTE = 60000;

const JOB_ID_FORBIDDEN_CHARS = /[+:]/g;

const jobIdSafeAddress = (senderAddress: string): string =>
  senderAddress.replace(JOB_ID_FORBIDDEN_CHARS, '');

export const buildCloseGroupJobId = (payload: CloseGroupJobPayload): string => {
  if (payload.kind === 'window') {
    const rescheduleSuffix =
      typeof payload.reschedule === 'number' && payload.reschedule > 0
        ? `-${RECEIPT_CLOSE_RESCHEDULE_JOB_SUFFIX}${payload.reschedule}`
        : '';
    return `${RECEIPT_CLOSE_JOB_ID_PREFIX}-${payload.groupId}-${payload.pageIndex}${rescheduleSuffix}`;
  }
  return `${RECEIPT_CLOSE_JOB_ID_PREFIX}-${payload.coupleId}-${jobIdSafeAddress(payload.senderAddress)}-${RECEIPT_CLOSE_COMMAND_JOB_SUFFIX}`;
};

export const buildCloseGroupJobOptions = (
  payload: CloseGroupJobPayload,
  delayMs: number,
): { jobId: string; delay: number; removeOnFail: true } => ({
  jobId: buildCloseGroupJobId(payload),
  delay: delayMs,
  removeOnFail: true,
});

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
    await this.getQueue().add(
      RECEIPT_JOB.CLOSE_GROUP,
      payload,
      buildCloseGroupJobOptions(payload, delayMs),
    );
    this.logger.log(
      `job_enqueued name=${RECEIPT_JOB.CLOSE_GROUP} kind=${payload.kind} delayMs=${delayMs}`,
    );
  }

  async enqueueNotifyUser(payload: NotifyUserJobPayload): Promise<void> {
    await this.getQueue().add(RECEIPT_JOB.NOTIFY_USER, payload);
    this.logger.log(`job_enqueued name=${RECEIPT_JOB.NOTIFY_USER}`);
  }

  async enqueueExtractGroup(payload: ExtractGroupJobPayload): Promise<void> {
    await this.getQueue().add(RECEIPT_JOB.EXTRACT_GROUP, payload);
    this.logger.log(`job_enqueued name=${RECEIPT_JOB.EXTRACT_GROUP}`);
  }

  async enqueueNormalizeGroup(
    payload: NormalizeGroupJobPayload,
  ): Promise<void> {
    await this.getQueue().add(RECEIPT_JOB.NORMALIZE_GROUP, payload);
    this.logger.log(`job_enqueued name=${RECEIPT_JOB.NORMALIZE_GROUP}`);
  }

  async enqueueAnswerQuery(payload: AnswerQueryJobPayload): Promise<void> {
    await this.getQueue().add(RECEIPT_JOB.ANSWER_QUERY, payload, {
      removeOnFail: true,
    });
    this.logger.log(`job_enqueued name=${RECEIPT_JOB.ANSWER_QUERY}`);
  }

  async ensureSweepScheduler(): Promise<void> {
    const intervalMs =
      this.config.sweepIntervalMinutes * MILLISECONDS_PER_MINUTE;
    await this.getQueue().upsertJobScheduler(
      RECEIPT_JOB.SWEEP_STALE_GROUPS,
      { every: intervalMs },
      { name: RECEIPT_JOB.SWEEP_STALE_GROUPS },
    );
    this.logger.log(`sweep_scheduler_registered intervalMs=${intervalMs}`);
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
