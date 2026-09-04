import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { Worker, type Job } from 'bullmq';
import type IORedis from 'ioredis';
import { ReceiptConfigService } from '../receipt.config.js';
import { RECEIPT_JOB, RECEIPT_QUEUE_NAME } from '../receipt.constants.js';
import { createReceiptRedisConnection } from './receipt-queue.service.js';
import type { IngestImageJobPayload } from './receipt-queue.constants.js';
import { IngestImageProcessor } from './processors/ingest-image.processor.js';

export class UnknownReceiptJobError extends Error {
  constructor(name: string) {
    super(`unknown_receipt_job name=${name}`);
    this.name = 'UnknownReceiptJobError';
  }
}

@Injectable()
export class ReceiptWorkerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ReceiptWorkerService.name);
  private connection?: IORedis;
  private worker?: Worker;

  constructor(
    private readonly config: ReceiptConfigService,
    private readonly ingestImage: IngestImageProcessor,
  ) {}

  onModuleInit(): void {
    if (!this.config.workerEnabled) {
      this.logger.log('receipt_worker_disabled');
      return;
    }

    const redisUrl = this.config.redisUrl;
    if (!redisUrl) {
      this.logger.warn('receipt_worker_disabled REDIS_URL no configurado');
      return;
    }

    this.connection = createReceiptRedisConnection(redisUrl);
    this.worker = new Worker(RECEIPT_QUEUE_NAME, (job) => this.handle(job), {
      connection: this.connection,
      concurrency: this.config.workerConcurrency,
    });
    this.worker.on('failed', (job, error) => {
      this.logger.error(
        `job_failed name=${job?.name ?? 'unknown'} attempt=${job?.attemptsMade ?? 0} error=${error.message}`,
      );
    });
    this.logger.log('receipt_worker_started');
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker?.close();
    await this.connection?.quit();
  }

  private async handle(job: Job): Promise<unknown> {
    if (job.name === RECEIPT_JOB.INGEST_IMAGE) {
      return this.ingestImage.process(job.data as IngestImageJobPayload);
    }
    throw new UnknownReceiptJobError(job.name);
  }
}
