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
import {
  createReceiptRedisConnection,
  ReceiptQueueService,
} from './receipt-queue.service.js';
import type {
  AnswerQueryJobPayload,
  CloseGroupJobPayload,
  ExtractGroupJobPayload,
  IngestImageJobPayload,
  NormalizeGroupJobPayload,
  NotifyUserJobPayload,
} from './receipt-queue.constants.js';
import { IngestImageProcessor } from './processors/ingest-image.processor.js';
import { CloseGroupProcessor } from './processors/close-group.processor.js';
import { NotifyUserProcessor } from './processors/notify-user.processor.js';
import { ExtractGroupProcessor } from './processors/extract-group.processor.js';
import { NormalizeGroupProcessor } from './processors/normalize-group.processor.js';
import { AnswerQueryProcessor } from './processors/answer-query.processor.js';
import { StaleGroupSweeperService } from '../groups/stale-group-sweeper.service.js';

export class UnknownReceiptJobError extends Error {
  constructor(name: string) {
    super(`unknown_receipt_job name=${name}`);
    this.name = 'UnknownReceiptJobError';
  }
}

const hasGroupId = (data: unknown): data is { groupId: string } =>
  typeof data === 'object' &&
  data !== null &&
  typeof (data as Record<string, unknown>)['groupId'] === 'string';

@Injectable()
export class ReceiptWorkerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ReceiptWorkerService.name);
  private connection?: IORedis;
  private worker?: Worker;

  constructor(
    private readonly config: ReceiptConfigService,
    private readonly queue: ReceiptQueueService,
    private readonly ingestImage: IngestImageProcessor,
    private readonly closeGroup: CloseGroupProcessor,
    private readonly notifyUser: NotifyUserProcessor,
    private readonly extractGroup: ExtractGroupProcessor,
    private readonly normalizeGroup: NormalizeGroupProcessor,
    private readonly answerQuery: AnswerQueryProcessor,
    private readonly staleGroupSweeper: StaleGroupSweeperService,
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
    void this.queue.ensureSweepScheduler().catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`sweep_scheduler_setup_failed error=${message}`);
    });
    this.logger.log('receipt_worker_started');
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker?.close();
    await this.connection?.quit();
  }

  private registerFailureHandler(worker: Worker): void {
    worker.on('failed', (job, error) => {
      const groupSuffix = hasGroupId(job?.data)
        ? ` group=${job.data.groupId}`
        : '';
      this.logger.error(
        `job_failed name=${job?.name ?? 'unknown'} attempt=${job?.attemptsMade ?? 0}${groupSuffix} error=${error.message}`,
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
      case RECEIPT_JOB.NORMALIZE_GROUP:
        return this.normalizeGroup.process(
          job.data as NormalizeGroupJobPayload,
        );
      case RECEIPT_JOB.SWEEP_STALE_GROUPS:
        return this.staleGroupSweeper.sweep();
      case RECEIPT_JOB.ANSWER_QUERY:
        return this.answerQuery.process(job.data as AnswerQueryJobPayload);
      default:
        throw new UnknownReceiptJobError(job.name);
    }
  }
}
