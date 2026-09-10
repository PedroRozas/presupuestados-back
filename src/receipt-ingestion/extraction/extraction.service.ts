import { Inject, Injectable, Logger } from '@nestjs/common';
import type {
  NewReceiptExtraction,
  NewReceiptItem,
  ReceiptGroup,
  ReceiptImage,
} from '../../database/schema/index.js';
import {
  hasLlmUsage,
  LLM_EXTRACTION_PROVIDER,
  type LlmExtractionProvider,
  type LlmExtractionResult,
} from '../llm/llm.interfaces.js';
import { ReceiptConfigService } from '../receipt.config.js';
import {
  RECEIPT_EXTRACTION_STATUS,
  RECEIPT_IMAGE_CONTENT_TYPE,
  RECEIPT_PERIOD_TIME_ZONE,
  RECEIPT_REVIEW_REASONS,
  type ReceiptReviewReason,
} from '../receipt.constants.js';
import { ReceiptExtractionsRepository } from '../repository/receipt-extractions.repository.js';
import { ReceiptGroupsRepository } from '../repository/receipt-groups.repository.js';
import { ReceiptImagesRepository } from '../repository/receipt-images.repository.js';
import { ReceiptItemsRepository } from '../repository/receipt-items.repository.js';
import { ReceiptStorageService } from '../storage/receipt-storage.service.js';
import {
  parseExtractionOutput,
  type ExtractionItem,
  type ExtractionOutput,
} from './extraction-output.schema.js';
import { ExtractionUsageRepository } from './extraction-usage.repository.js';
import { currentPeriodMonth } from './period-month.js';
import { EXTRACTION_PROMPT_V3 } from './prompts/extraction-prompt.v3.js';
import { applyLineDiscounts } from '../utils/apply-line-discounts.js';
import { evaluateReview, type ReviewVerdict } from './review-rules.js';

export interface ExtractGroupInput {
  groupId: string;
  coupleId: string;
  attempt: number;
}

export interface ExtractionSummary {
  merchantRaw: string | null;
  receiptDate: string | null;
  total: number | null;
  itemCount: number;
}

export type ExtractionOutcome =
  | { outcome: 'skipped'; reason: 'not_found' | 'not_extracting' | 'no_images' }
  | { outcome: 'monthly_cap' }
  | {
      outcome: 'extracted';
      status: 'ready' | 'needs_review';
      reasons: ReceiptReviewReason[];
      summary: ExtractionSummary;
    };

const FIRST_POSITION = 1;
const EMPTY_RESULT: LlmExtractionResult = {
  rawText: '',
  model: 'unknown',
  tokensIn: 0,
  tokensOut: 0,
  latencyMs: 0,
};

const toNumericString = (value: number | null): string | null =>
  value === null ? null : String(value);

@Injectable()
export class ExtractionService {
  private readonly logger = new Logger(ExtractionService.name);

  constructor(
    private readonly groups: ReceiptGroupsRepository,
    private readonly images: ReceiptImagesRepository,
    private readonly extractions: ReceiptExtractionsRepository,
    private readonly items: ReceiptItemsRepository,
    private readonly usage: ExtractionUsageRepository,
    private readonly storage: ReceiptStorageService,
    @Inject(LLM_EXTRACTION_PROVIDER)
    private readonly provider: LlmExtractionProvider,
    private readonly config: ReceiptConfigService,
  ) {}

  async extractGroup(input: ExtractGroupInput): Promise<ExtractionOutcome> {
    const group = await this.groups.findById(input.groupId);
    if (!group) return { outcome: 'skipped', reason: 'not_found' };
    if (group.coupleId !== input.coupleId) {
      return { outcome: 'skipped', reason: 'not_found' };
    }
    if (group.status !== 'extracting') {
      return { outcome: 'skipped', reason: 'not_extracting' };
    }

    const images = await this.images.listByGroup(group.id);
    if (images.length === 0) {
      await this.groups.markFailed(group.id, [
        RECEIPT_REVIEW_REASONS.EXTRACTION_FAILED,
      ]);
      return { outcome: 'skipped', reason: 'no_images' };
    }

    if (!(await this.reserveUsage(group))) {
      await this.groups.markFailed(group.id, [
        RECEIPT_REVIEW_REASONS.MONTHLY_CAP,
      ]);
      return { outcome: 'monthly_cap' };
    }

    const buffers = await this.downloadAll(images);
    const output = await this.callModel(group, input.attempt, buffers);
    return this.persist(group, output.parsed, output.result, input.attempt);
  }

  private downloadAll(images: ReceiptImage[]): Promise<Buffer[]> {
    return Promise.all(
      images.map((image) => this.storage.download(image.storagePath)),
    );
  }

  private reserveUsage(group: ReceiptGroup): Promise<boolean> {
    return this.usage.tryReserve(
      group.coupleId,
      currentPeriodMonth(new Date(), RECEIPT_PERIOD_TIME_ZONE),
      this.config.monthlyExtractionCap,
    );
  }

  private async callModel(
    group: ReceiptGroup,
    attempt: number,
    buffers: Buffer[],
  ): Promise<{ parsed: ExtractionOutput; result: LlmExtractionResult }> {
    let result = EMPTY_RESULT;
    try {
      result = await this.provider.extract({
        images: buffers.map((buffer) => ({
          buffer,
          contentType: RECEIPT_IMAGE_CONTENT_TYPE,
        })),
        systemPrompt: EXTRACTION_PROMPT_V3.system,
        userPrompt: EXTRACTION_PROMPT_V3.user,
        outputJsonSchema: EXTRACTION_PROMPT_V3.outputJsonSchema,
        schemaName: EXTRACTION_PROMPT_V3.schemaName,
        maxOutputTokens: this.config.extractionMaxOutputTokens,
        timeoutMs: this.config.extractionTimeoutMs,
      });
      return { parsed: parseExtractionOutput(result.rawText), result };
    } catch (error) {
      await this.recordFailure(group, attempt, result, error);
      throw error;
    }
  }

  private async recordFailure(
    group: ReceiptGroup,
    attempt: number,
    result: LlmExtractionResult,
    error: unknown,
  ): Promise<void> {
    const usage = hasLlmUsage(error) ? error.usage : result;
    const message = error instanceof Error ? error.message : String(error);
    await this.extractions.create({
      groupId: group.id,
      coupleId: group.coupleId,
      model: usage.model,
      promptVersion: EXTRACTION_PROMPT_V3.version,
      rawJson: result.rawText ? { raw_text: result.rawText } : null,
      tokensIn: usage.tokensIn,
      tokensOut: usage.tokensOut,
      latencyMs: usage.latencyMs,
      attempt,
      status: RECEIPT_EXTRACTION_STATUS.FAILED,
      error: message,
    });
    this.logger.warn(
      `extraction_failed group=${group.id} attempt=${attempt} error=${message}`,
    );
  }

  private async persist(
    group: ReceiptGroup,
    parsed: ExtractionOutput,
    result: LlmExtractionResult,
    attempt: number,
  ): Promise<ExtractionOutcome> {
    const normalized = { ...parsed, items: applyLineDiscounts(parsed.items) };
    const verdict = evaluateReview(normalized, {
      minConfidence: this.config.minConfidence,
      totalToleranceClp: this.config.totalToleranceClp,
    });
    if (normalized.items.some((item) => item.amount < 0)) {
      verdict.status = 'needs_review';
      verdict.reasons.push(RECEIPT_REVIEW_REASONS.UNASSIGNED_DISCOUNT);
    }
    await this.extractions.create(
      this.succeededRow(group, parsed, result, attempt),
    );
    await this.items.replaceForGroup(
      group.id,
      this.toItems(group, normalized.items),
    );
    await this.groups.applyExtraction(group.id, {
      status: verdict.status,
      reviewReasons: verdict.reasons,
      merchantRaw: parsed.merchant_raw,
      merchantRut: parsed.merchant_rut,
      receiptDate: parsed.receipt_date,
      totalDeclared: toNumericString(parsed.total),
      currency: parsed.currency,
      sourceKind: parsed.source_kind,
    });
    this.logger.log(
      `extraction_done group=${group.id} status=${verdict.status} items=${normalized.items.length} tokens=${result.tokensIn}/${result.tokensOut}`,
    );
    return this.toOutcome(normalized, verdict);
  }

  private succeededRow(
    group: ReceiptGroup,
    parsed: ExtractionOutput,
    result: LlmExtractionResult,
    attempt: number,
  ): NewReceiptExtraction {
    return {
      groupId: group.id,
      coupleId: group.coupleId,
      model: result.model,
      promptVersion: EXTRACTION_PROMPT_V3.version,
      rawJson: parsed,
      confidence: String(parsed.confidence),
      tokensIn: result.tokensIn,
      tokensOut: result.tokensOut,
      latencyMs: result.latencyMs,
      attempt,
      status: RECEIPT_EXTRACTION_STATUS.SUCCEEDED,
    };
  }

  private toOutcome(
    parsed: ExtractionOutput,
    verdict: ReviewVerdict,
  ): ExtractionOutcome {
    return {
      outcome: 'extracted',
      status: verdict.status,
      reasons: verdict.reasons,
      summary: {
        merchantRaw: parsed.merchant_raw,
        receiptDate: parsed.receipt_date,
        total: parsed.total,
        itemCount: parsed.items.length,
      },
    };
  }

  private toItems(
    group: ReceiptGroup,
    items: ExtractionItem[],
  ): NewReceiptItem[] {
    return items.map((item, index) => ({
      groupId: group.id,
      coupleId: group.coupleId,
      descriptionRaw: item.description_raw,
      productNameSuggested: item.product_name ?? null,
      category: item.category,
      qty: toNumericString(item.qty),
      unitPrice: toNumericString(item.unit_price),
      amount: String(item.amount),
      confidence: String(item.confidence),
      sourceImageId: null,
      position: index + FIRST_POSITION,
    }));
  }
}
