import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  RECEIPT_DEFAULTS,
  RECEIPT_MESSAGING_SOURCE_DEFAULT,
} from './receipt.constants.js';

export type ReceiptMediaSource = 'meta' | 'local';

export type ReceiptMessagingSource = 'meta' | 'local';

@Injectable()
export class ReceiptConfigService {
  constructor(private readonly configService: ConfigService) {}

  get workerEnabled(): boolean {
    return this.getBoolean(
      'RECEIPT_WORKER_ENABLED',
      RECEIPT_DEFAULTS.workerEnabled,
    );
  }

  get whatsappAppSecret(): string {
    return this.configService.getOrThrow<string>('RECEIPT_WA_APP_SECRET');
  }

  get whatsappVerifyToken(): string {
    return this.configService.getOrThrow<string>('RECEIPT_WA_VERIFY_TOKEN');
  }

  get whatsappAccessToken(): string {
    return this.configService.getOrThrow<string>('RECEIPT_WA_ACCESS_TOKEN');
  }

  get whatsappPhoneNumberId(): string {
    return this.configService.getOrThrow<string>('RECEIPT_WA_PHONE_NUMBER_ID');
  }

  get graphApiVersion(): string {
    return this.getString(
      'RECEIPT_WA_GRAPH_API_VERSION',
      RECEIPT_DEFAULTS.graphApiVersion,
    );
  }

  get mediaSource(): ReceiptMediaSource {
    const value = this.getString(
      'RECEIPT_MEDIA_SOURCE',
      RECEIPT_DEFAULTS.mediaSource,
    );
    return value === 'local' ? 'local' : 'meta';
  }

  get messagingSource(): ReceiptMessagingSource {
    const value = this.getString(
      'RECEIPT_MESSAGING_SOURCE',
      RECEIPT_MESSAGING_SOURCE_DEFAULT,
    );
    return value === 'local' ? 'local' : 'meta';
  }

  get localMediaDir(): string {
    return this.getString(
      'RECEIPT_LOCAL_MEDIA_DIR',
      RECEIPT_DEFAULTS.localMediaDir,
    );
  }

  get storageBucket(): string {
    return this.getString(
      'RECEIPT_STORAGE_BUCKET',
      RECEIPT_DEFAULTS.storageBucket,
    );
  }

  get signedUrlTtlSeconds(): number {
    return this.getNumber(
      'RECEIPT_SIGNED_URL_TTL_SECONDS',
      RECEIPT_DEFAULTS.signedUrlTtlSeconds,
    );
  }

  get groupWindowSeconds(): number {
    return this.getNumber(
      'RECEIPT_GROUP_WINDOW_SECONDS',
      RECEIPT_DEFAULTS.groupWindowSeconds,
    );
  }

  get webpQuality(): number {
    const configured = this.getNumber(
      'RECEIPT_WEBP_QUALITY',
      RECEIPT_DEFAULTS.webpQuality,
    );
    return Math.max(configured, RECEIPT_DEFAULTS.minWebpQuality);
  }

  get maxWidthPx(): number {
    return this.getNumber('RECEIPT_MAX_WIDTH_PX', RECEIPT_DEFAULTS.maxWidthPx);
  }

  get rateLimitWindowSeconds(): number {
    return this.getNumber(
      'RECEIPT_RATE_LIMIT_WINDOW_SECONDS',
      RECEIPT_DEFAULTS.rateLimitWindowSeconds,
    );
  }

  get rateLimitMax(): number {
    return this.getNumber(
      'RECEIPT_RATE_LIMIT_MAX',
      RECEIPT_DEFAULTS.rateLimitMax,
    );
  }

  get workerConcurrency(): number {
    return this.getNumber(
      'RECEIPT_WORKER_CONCURRENCY',
      RECEIPT_DEFAULTS.workerConcurrency,
    );
  }

  get retryAttempts(): number {
    return RECEIPT_DEFAULTS.retryAttempts;
  }

  get retryBackoffMs(): number {
    return this.getNumber(
      'RECEIPT_RETRY_BACKOFF_MS',
      RECEIPT_DEFAULTS.retryBackoffMs,
    );
  }

  get redisUrl(): string | undefined {
    return this.configService.get<string>('REDIS_URL') || undefined;
  }

  get openAiApiKey(): string {
    return this.configService.getOrThrow<string>('OPENAI_API_KEY');
  }

  get extractionModel(): string {
    return this.configService.getOrThrow<string>('RECEIPT_EXTRACTION_MODEL');
  }

  get extractionMaxOutputTokens(): number {
    return this.getNumber(
      'RECEIPT_EXTRACTION_MAX_OUTPUT_TOKENS',
      RECEIPT_DEFAULTS.extractionMaxOutputTokens,
    );
  }

  get extractionTimeoutMs(): number {
    return this.getNumber(
      'RECEIPT_EXTRACTION_TIMEOUT_MS',
      RECEIPT_DEFAULTS.extractionTimeoutMs,
    );
  }

  get minConfidence(): number {
    return this.getRatio(
      'RECEIPT_MIN_CONFIDENCE',
      RECEIPT_DEFAULTS.minConfidence,
    );
  }

  get totalToleranceClp(): number {
    return this.getNumber(
      'RECEIPT_TOTAL_TOLERANCE_CLP',
      RECEIPT_DEFAULTS.totalToleranceClp,
    );
  }

  get monthlyExtractionCap(): number {
    return this.getNumber(
      'RECEIPT_MONTHLY_EXTRACTION_CAP',
      RECEIPT_DEFAULTS.monthlyExtractionCap,
    );
  }

  get normalizationModel(): string {
    return this.configService.getOrThrow<string>('RECEIPT_NORMALIZATION_MODEL');
  }

  get normalizationMaxOutputTokens(): number {
    return this.getNumber(
      'RECEIPT_NORMALIZATION_MAX_OUTPUT_TOKENS',
      RECEIPT_DEFAULTS.normalizationMaxOutputTokens,
    );
  }

  get normalizationTimeoutMs(): number {
    return this.getNumber(
      'RECEIPT_NORMALIZATION_TIMEOUT_MS',
      RECEIPT_DEFAULTS.normalizationTimeoutMs,
    );
  }

  get extractionTemperature(): number | undefined {
    return this.getOptionalNumberWithDefault(
      'RECEIPT_EXTRACTION_TEMPERATURE',
      RECEIPT_DEFAULTS.extractionTemperature,
    );
  }

  get normalizationTemperature(): number | undefined {
    return this.getOptionalNumber('RECEIPT_NORMALIZATION_TEMPERATURE');
  }

  get extractionReasoningEffort(): string | undefined {
    return this.getOptionalString('RECEIPT_EXTRACTION_REASONING_EFFORT');
  }

  get normalizationReasoningEffort(): string | undefined {
    return this.getOptionalStringWithDefault(
      'RECEIPT_NORMALIZATION_REASONING_EFFORT',
      RECEIPT_DEFAULTS.normalizationReasoningEffort,
    );
  }

  get matchHigh(): number {
    return this.getRatio('RECEIPT_MATCH_HIGH', RECEIPT_DEFAULTS.matchHigh);
  }

  get matchLow(): number {
    return this.getRatio('RECEIPT_MATCH_LOW', RECEIPT_DEFAULTS.matchLow);
  }

  get candidateLimit(): number {
    return this.getNumber(
      'RECEIPT_CANDIDATE_LIMIT',
      RECEIPT_DEFAULTS.candidateLimit,
    );
  }

  get sweepIntervalMinutes(): number {
    return this.getNumber(
      'RECEIPT_SWEEP_INTERVAL_MINUTES',
      RECEIPT_DEFAULTS.sweepIntervalMinutes,
    );
  }

  get staleExtractingMinutes(): number {
    return this.getNumber(
      'RECEIPT_STALE_EXTRACTING_MINUTES',
      RECEIPT_DEFAULTS.staleExtractingMinutes,
    );
  }

  get queryModel(): string {
    return this.configService.getOrThrow<string>('RECEIPT_QUERY_MODEL');
  }

  get queryMaxOutputTokens(): number {
    return this.getNumber(
      'RECEIPT_QUERY_MAX_OUTPUT_TOKENS',
      RECEIPT_DEFAULTS.queryMaxOutputTokens,
    );
  }

  get queryMaxToolRounds(): number {
    return this.getNumber(
      'RECEIPT_QUERY_MAX_TOOL_ROUNDS',
      RECEIPT_DEFAULTS.queryMaxToolRounds,
    );
  }

  get queryTimeoutMs(): number {
    return this.getNumber(
      'RECEIPT_QUERY_TIMEOUT_MS',
      RECEIPT_DEFAULTS.queryTimeoutMs,
    );
  }

  get queryRateLimitWindowSeconds(): number {
    return this.getNumber(
      'RECEIPT_QUERY_RATE_LIMIT_WINDOW_SECONDS',
      RECEIPT_DEFAULTS.queryRateLimitWindowSeconds,
    );
  }

  get queryRateLimitMax(): number {
    return this.getNumber(
      'RECEIPT_QUERY_RATE_LIMIT_MAX',
      RECEIPT_DEFAULTS.queryRateLimitMax,
    );
  }

  get queryTemperature(): number | undefined {
    return this.getOptionalNumberWithDefault(
      'RECEIPT_QUERY_TEMPERATURE',
      RECEIPT_DEFAULTS.queryTemperature,
    );
  }

  get queryReasoningEffort(): string | undefined {
    return this.getOptionalString('RECEIPT_QUERY_REASONING_EFFORT');
  }

  get queryMaxMessageChars(): number {
    return this.getNumber(
      'RECEIPT_QUERY_MAX_MESSAGE_CHARS',
      RECEIPT_DEFAULTS.queryMaxMessageChars,
    );
  }

  private getString(key: string, fallback: string): string {
    const value = this.configService.get<string>(key);
    return value && value.length > 0 ? value : fallback;
  }

  private getNumber(key: string, fallback: number): number {
    const value = Number(this.configService.get<string>(key));
    return Number.isFinite(value) && value > 0 ? value : fallback;
  }

  private getRatio(key: string, fallback: number): number {
    const value = Number(this.configService.get<string>(key));
    return Number.isFinite(value) && value >= 0 && value <= 1
      ? value
      : fallback;
  }

  private getBoolean(key: string, fallback: boolean): boolean {
    const value = this.configService.get<string>(key);
    if (value === undefined || value === '') return fallback;
    return value === 'true' || value === '1';
  }

  private getOptionalString(key: string): string | undefined {
    const value = this.configService.get<string>(key);
    return value && value.length > 0 ? value : undefined;
  }

  private getOptionalStringWithDefault(
    key: string,
    fallback: string,
  ): string | undefined {
    const value = this.configService.get<string>(key);
    if (value === undefined) return fallback;
    return value.length > 0 ? value : undefined;
  }

  private getOptionalNumber(key: string): number | undefined {
    const raw = this.configService.get<string>(key);
    if (!raw) return undefined;
    const value = Number(raw);
    return Number.isFinite(value) ? value : undefined;
  }

  private getOptionalNumberWithDefault(
    key: string,
    fallback: number,
  ): number | undefined {
    const raw = this.configService.get<string>(key);
    if (raw === undefined) return fallback;
    if (raw === '') return undefined;
    const value = Number(raw);
    return Number.isFinite(value) ? value : fallback;
  }
}
