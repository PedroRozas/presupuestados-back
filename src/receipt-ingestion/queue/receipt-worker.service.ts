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
import type {
  CloseGroupJobPayload,
  ExtractGroupJobPayload,
  IngestImageJobPayload,
  NotifyUserJobPayload,
} from './receipt-queue.constants.js';
import { IngestImageProcessor } from './processors/ingest-image.processor.js';
import { CloseGroupProcessor } from './processors/close-group.processor.js';
import { NotifyUserProcessor } from './processors/notify-user.processor.js';
import { ExtractGroupProcessor } from './processors/extract-group.processor.js';

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
    private readonly closeGroup: CloseGroupProcessor,
    private readonly notifyUser: NotifyUserProcessor,
    private readonly extractGroup: ExtractGroupProcessor,
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
    this.registerFailureHandler(this.worker);
    this.logger.log('receipt_worker_started');
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker?.close();
    await this.connection?.quit();
  }

  private registerFailureHandler(worker: Worker): void {
    worker.on('failed', (job, error) => {
      this.logger.error(
        `job_failed name=${job?.name ?? 'unknown'} attempt=${job?.attemptsMade ?? 0} error=${error.message}`,
      );
      if (job && this.isExhaustedExtraction(job)) {
        void this.extractGroup
          .onExhausted(job.data as ExtractGroupJobPayload)
          .catch((exhaustError: unknown) => {
            const message =
              exhaustError instanceof Error
                ? exhaustError.message
                : String(exhaustError);
            this.logger.error(
              `extraction_exhausted_handler_failed error=${message}`,
            );
          });
      }
    });
  }

  private isExhaustedExtraction(job: Job): boolean {
    const maxAttempts = job.opts.attempts ?? 1;
    return (
      job.name === RECEIPT_JOB.EXTRACT_GROUP && job.attemptsMade >= maxAttempts
    );
  }

  private async handle(job: Job): Promise<unknown> {
    switch (job.name) {
      case RECEIPT_JOB.INGEST_IMAGE:
        return this.ingestImage.process(job.data as IngestImageJobPayload);
      case RECEIPT_JOB.CLOSE_GROUP:
        return this.closeGroup.process(job.data as CloseGroupJobPayload);
      case RECEIPT_JOB.NOTIFY_USER:
        return this.notifyUser.process(job.data as NotifyUserJobPayload);
      case RECEIPT_JOB.EXTRACT_GROUP:
        return this.extractGroup.process(
          job.data as ExtractGroupJobPayload,
          job.attemptsMade + 1,
        );
      default:
        throw new UnknownReceiptJobError(job.name);
    }
  }
}
