import { Inject, Injectable, Logger } from '@nestjs/common';
import type { ReceiptGroup, ReceiptItem } from '../../database/schema/index.js';
import {
  LLM_NORMALIZATION_PROVIDER,
  type LlmNormalizationInput,
  type LlmNormalizationProvider,
  type NormalizationCandidate,
  type NormalizationQuestion,
} from '../llm/llm.interfaces.js';
import { ReceiptConfigService } from '../receipt.config.js';
import { ReceiptMerchantsRepository } from '../repository/receipt-merchants.repository.js';
import { ReceiptGroupsRepository } from '../repository/receipt-groups.repository.js';
import { ReceiptItemsRepository } from '../repository/receipt-items.repository.js';
import { ReceiptProductsRepository } from '../repository/receipt-products.repository.js';
import { toCanonicalName } from './canonical-name.js';
import { decideMatch, type ScoredCandidate } from './match-decision.js';
import { parseNormalizationOutput } from './normalization-output.schema.js';
import { NORMALIZATION_PROMPT_V1 } from './prompts/normalization-prompt.v1.js';

export interface NormalizeGroupInput {
  groupId: string;
  coupleId: string;
}

export type MerchantOutcome = 'matched' | 'created' | 'none';

export type NormalizationOutcome =
  | { outcome: 'skipped'; reason: 'not_found' | 'not_extracted' }
  | {
      outcome: 'normalized';
      merchant: MerchantOutcome;
      items: { matched: number; created: number; llmDecided: number };
    };

interface PendingMerchant {
  question: NormalizationQuestion;
  canonicalRaw: string;
  rut: string | null;
}

interface PendingItem {
  question: NormalizationQuestion;
  item: ReceiptItem;
  canonicalRaw: string;
}

type MerchantNormalization =
  | { kind: 'resolved'; outcome: MerchantOutcome }
  | { kind: 'pending'; pending: PendingMerchant };

type ItemNormalization =
  | { kind: 'matched' }
  | { kind: 'created' }
  | { kind: 'pending'; pending: PendingItem };

interface ItemsNormalization {
  matched: number;
  created: number;
  pendingItems: PendingItem[];
}

interface ResolvedPending {
  merchantOutcome: MerchantOutcome;
  itemsMatched: number;
  itemsCreated: number;
}

const buildQuestion = (
  key: string,
  description: string,
  candidates: ScoredCandidate[],
): NormalizationQuestion => ({
  key,
  description,
  candidates: toNormalizationCandidates(candidates),
});

const toNormalizationCandidates = (
  candidates: ScoredCandidate[],
): NormalizationCandidate[] =>
  candidates.map((candidate) => ({
    id: candidate.id,
    canonicalName: candidate.canonicalName,
  }));

@Injectable()
export class NormalizationService {
  private readonly logger = new Logger(NormalizationService.name);

  constructor(
    private readonly groups: ReceiptGroupsRepository,
    private readonly items: ReceiptItemsRepository,
    private readonly products: ReceiptProductsRepository,
    private readonly merchants: ReceiptMerchantsRepository,
    @Inject(LLM_NORMALIZATION_PROVIDER)
    private readonly provider: LlmNormalizationProvider,
    private readonly config: ReceiptConfigService,
  ) {}

  async normalizeGroup(
    input: NormalizeGroupInput,
  ): Promise<NormalizationOutcome> {
    const group = await this.groups.findById(input.groupId);
    if (!group || group.coupleId !== input.coupleId) {
      return { outcome: 'skipped', reason: 'not_found' };
    }
    if (group.status !== 'ready' && group.status !== 'needs_review') {
      return { outcome: 'skipped', reason: 'not_extracted' };
    }

    const items = await this.items.listByGroup(group.id);
    const merchantResult = await this.normalizeMerchant(group);
    const itemsResult = await this.normalizeItems(group, items);
    const resolved = await this.resolveIfPending(
      group,
      merchantResult,
      itemsResult.pendingItems,
    );

    const outcome: NormalizationOutcome = {
      outcome: 'normalized',
      merchant: resolved.merchantOutcome,
      items: {
        matched: itemsResult.matched + resolved.itemsMatched,
        created: itemsResult.created + resolved.itemsCreated,
        llmDecided: resolved.itemsMatched + resolved.itemsCreated,
      },
    };
    this.logger.log(
      `normalization_done group=${group.id} merchant=${outcome.merchant} matched=${outcome.items.matched} created=${outcome.items.created} llm=${outcome.items.llmDecided}`,
    );
    return outcome;
  }

  private resolveIfPending(
    group: ReceiptGroup,
    merchantResult: MerchantNormalization,
    pendingItems: PendingItem[],
  ): Promise<ResolvedPending> {
    const fallbackMerchantOutcome: MerchantOutcome =
      merchantResult.kind === 'resolved' ? merchantResult.outcome : 'none';
    const merchantPending =
      merchantResult.kind === 'pending' ? merchantResult.pending : undefined;
    if (!merchantPending && pendingItems.length === 0) {
      return Promise.resolve({
        merchantOutcome: fallbackMerchantOutcome,
        itemsMatched: 0,
        itemsCreated: 0,
      });
    }
    return this.resolvePending(
      group,
      merchantPending,
      fallbackMerchantOutcome,
      pendingItems,
    );
  }

  private async normalizeMerchant(
    group: ReceiptGroup,
  ): Promise<MerchantNormalization> {
    if (group.merchantId) return { kind: 'resolved', outcome: 'matched' };
    if (!group.merchantRaw) return { kind: 'resolved', outcome: 'none' };
    const rut = group.merchantRut ?? null;
    if (rut) {
      const found = await this.merchants.findByRut(group.coupleId, rut);
      if (found) {
        await this.applyMerchantResolution(
          group,
          found.id,
          toCanonicalName(group.merchantRaw),
          found.canonicalName,
        );
        return { kind: 'resolved', outcome: 'matched' };
      }
    }
    return this.matchMerchantByTrigram(group, rut);
  }

  private async matchMerchantByTrigram(
    group: ReceiptGroup,
    rut: string | null,
  ): Promise<MerchantNormalization> {
    const canonicalRaw = toCanonicalName(group.merchantRaw ?? '');
    const candidates = await this.merchants.findCandidates(
      group.coupleId,
      canonicalRaw,
      this.config.candidateLimit,
    );
    const decision = decideMatch(candidates, {
      high: this.config.matchHigh,
      low: this.config.matchLow,
    });
    if (decision.kind === 'match') {
      return this.applyMerchantMatch(
        group,
        decision.id,
        canonicalRaw,
        candidates,
      );
    }
    if (decision.kind === 'new') {
      return this.createNewMerchant(group, canonicalRaw, rut);
    }
    return {
      kind: 'pending',
      pending: {
        canonicalRaw,
        rut,
        question: buildQuestion('merchant', canonicalRaw, decision.candidates),
      },
    };
  }

  private async applyMerchantMatch(
    group: ReceiptGroup,
    merchantId: string,
    canonicalRaw: string,
    candidates: ScoredCandidate[],
  ): Promise<MerchantNormalization> {
    const matchedCandidate = candidates.find((c) => c.id === merchantId);
    await this.applyMerchantResolution(
      group,
      merchantId,
      canonicalRaw,
      matchedCandidate?.canonicalName ?? canonicalRaw,
    );
    return { kind: 'resolved', outcome: 'matched' };
  }

  private async createNewMerchant(
    group: ReceiptGroup,
    canonicalRaw: string,
    rut: string | null,
  ): Promise<MerchantNormalization> {
    const created = await this.merchants.create(
      group.coupleId,
      canonicalRaw,
      rut,
    );
    await this.groups.setMerchant(group.id, created.id);
    return { kind: 'resolved', outcome: 'created' };
  }

  private async applyMerchantResolution(
    group: ReceiptGroup,
    merchantId: string,
    canonicalRaw: string,
    matchedCanonicalName: string,
  ): Promise<void> {
    await this.groups.setMerchant(group.id, merchantId);
    if (matchedCanonicalName !== canonicalRaw) {
      await this.merchants.addAlias(merchantId, canonicalRaw);
    }
  }

  private async normalizeItems(
    group: ReceiptGroup,
    items: ReceiptItem[],
  ): Promise<ItemsNormalization> {
    let matched = 0;
    let created = 0;
    const pendingItems: PendingItem[] = [];
    for (const item of items) {
      if (item.productId) continue;
      const outcome = await this.normalizeItem(group, item);
      if (outcome.kind === 'matched') matched += 1;
      else if (outcome.kind === 'created') created += 1;
      else pendingItems.push(outcome.pending);
    }
    return { matched, created, pendingItems };
  }

  private async normalizeItem(
    group: ReceiptGroup,
    item: ReceiptItem,
  ): Promise<ItemNormalization> {
    const canonicalRaw = toCanonicalName(item.descriptionRaw);
    const candidates = await this.products.findCandidates(
      group.coupleId,
      canonicalRaw,
      this.config.candidateLimit,
    );
    const decision = decideMatch(candidates, {
      high: this.config.matchHigh,
      low: this.config.matchLow,
    });
    if (decision.kind === 'match') {
      return this.applyItemMatch(item, decision.id, canonicalRaw, candidates);
    }
    if (decision.kind === 'new') {
      return this.createNewProduct(group, item, canonicalRaw);
    }
    return {
      kind: 'pending',
      pending: {
        item,
        canonicalRaw,
        question: buildQuestion(item.id, canonicalRaw, decision.candidates),
      },
    };
  }

  private async applyItemMatch(
    item: ReceiptItem,
    productId: string,
    canonicalRaw: string,
    candidates: ScoredCandidate[],
  ): Promise<ItemNormalization> {
    const matchedCandidate = candidates.find((c) => c.id === productId);
    await this.applyProductResolution(
      item.id,
      productId,
      canonicalRaw,
      matchedCandidate?.canonicalName ?? canonicalRaw,
    );
    return { kind: 'matched' };
  }

  private async createNewProduct(
    group: ReceiptGroup,
    item: ReceiptItem,
    canonicalRaw: string,
  ): Promise<ItemNormalization> {
    const created = await this.products.create(
      group.coupleId,
      canonicalRaw,
      item.category,
    );
    await this.items.setProduct(item.id, created.id);
    return { kind: 'created' };
  }

  private async applyProductResolution(
    itemId: string,
    productId: string,
    canonicalRaw: string,
    matchedCanonicalName: string,
  ): Promise<void> {
    await this.items.setProduct(itemId, productId);
    if (matchedCanonicalName !== canonicalRaw) {
      await this.products.addAlias(productId, canonicalRaw);
    }
  }

  private buildProviderInput(
    questions: NormalizationQuestion[],
  ): LlmNormalizationInput {
    return {
      questions,
      systemPrompt: NORMALIZATION_PROMPT_V1.system,
      userPrompt: NORMALIZATION_PROMPT_V1.buildUser(questions),
      outputJsonSchema: NORMALIZATION_PROMPT_V1.outputJsonSchema,
      schemaName: NORMALIZATION_PROMPT_V1.schemaName,
      maxOutputTokens: this.config.normalizationMaxOutputTokens,
      timeoutMs: this.config.extractionTimeoutMs,
    };
  }

  private decisionsByKey(rawText: string): Map<string, string | null> {
    const parsed = parseNormalizationOutput(rawText);
    return new Map(
      parsed.decisions.map((decision) => [decision.key, decision.candidate_id]),
    );
  }

  private async resolveItemDecisions(
    group: ReceiptGroup,
    itemPendings: PendingItem[],
    decisionsByKey: Map<string, string | null>,
  ): Promise<{ itemsMatched: number; itemsCreated: number }> {
    let itemsMatched = 0;
    let itemsCreated = 0;
    for (const pending of itemPendings) {
      const matched = await this.resolveItemDecision(
        group,
        pending,
        decisionsByKey.get(pending.question.key) ?? null,
      );
      if (matched) itemsMatched += 1;
      else itemsCreated += 1;
    }
    return { itemsMatched, itemsCreated };
  }

  private async resolvePending(
    group: ReceiptGroup,
    merchantPending: PendingMerchant | undefined,
    fallbackMerchantOutcome: MerchantOutcome,
    itemPendings: PendingItem[],
  ): Promise<ResolvedPending> {
    const questions: NormalizationQuestion[] = [
      ...(merchantPending ? [merchantPending.question] : []),
      ...itemPendings.map((pending) => pending.question),
    ];
    const result = await this.provider.chooseCandidates(
      this.buildProviderInput(questions),
    );
    const decisionsByKey = this.decisionsByKey(result.rawText);

    const merchantOutcome = merchantPending
      ? await this.resolveMerchantDecision(
          group,
          merchantPending,
          decisionsByKey.get('merchant') ?? null,
        )
      : fallbackMerchantOutcome;

    const { itemsMatched, itemsCreated } = await this.resolveItemDecisions(
      group,
      itemPendings,
      decisionsByKey,
    );

    return { merchantOutcome, itemsMatched, itemsCreated };
  }

  private async resolveMerchantDecision(
    group: ReceiptGroup,
    pending: PendingMerchant,
    candidateId: string | null,
  ): Promise<MerchantOutcome> {
    const candidate = candidateId
      ? pending.question.candidates.find((c) => c.id === candidateId)
      : undefined;
    if (candidate) {
      await this.applyMerchantResolution(
        group,
        candidate.id,
        pending.canonicalRaw,
        candidate.canonicalName,
      );
      return 'matched';
    }
    const created = await this.merchants.create(
      group.coupleId,
      pending.canonicalRaw,
      pending.rut,
    );
    await this.groups.setMerchant(group.id, created.id);
    return 'created';
  }

  private async resolveItemDecision(
    group: ReceiptGroup,
    pending: PendingItem,
    candidateId: string | null,
  ): Promise<boolean> {
    const candidate = candidateId
      ? pending.question.candidates.find((c) => c.id === candidateId)
      : undefined;
    if (candidate) {
      await this.applyProductResolution(
        pending.item.id,
        candidate.id,
        pending.canonicalRaw,
        candidate.canonicalName,
      );
      return true;
    }
    const created = await this.products.create(
      group.coupleId,
      pending.canonicalRaw,
      pending.item.category,
    );
    await this.items.setProduct(pending.item.id, created.id);
    return false;
  }
}
