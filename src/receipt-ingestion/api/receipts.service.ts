import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type {
  NewReceiptItem,
  ReceiptGroup,
  ReceiptImage,
  ReceiptItem,
} from '../../database/schema/index.js';
import { toCanonicalName } from '../normalization/canonical-name.js';
import { ReceiptQueueService } from '../queue/receipt-queue.service.js';
import { ReceiptConfigService } from '../receipt.config.js';
import { AllowedSendersRepository } from '../repository/allowed-senders.repository.js';
import { ReceiptExtractionsRepository } from '../repository/receipt-extractions.repository.js';
import { ReceiptGroupsRepository } from '../repository/receipt-groups.repository.js';
import type { ReceiptGroupHeaderPatch } from '../repository/receipt-groups.repository.js';
import { ReceiptImagesRepository } from '../repository/receipt-images.repository.js';
import { ReceiptItemsRepository } from '../repository/receipt-items.repository.js';
import { ReceiptMerchantsRepository } from '../repository/receipt-merchants.repository.js';
import { ReceiptProductsRepository } from '../repository/receipt-products.repository.js';
import { ReceiptQueryRepository } from '../repository/receipt-query.repository.js';
import { ReceiptStorageService } from '../storage/receipt-storage.service.js';
import type {
  ReplaceItemDto,
  ReplaceItemsDto,
} from './dto/replace-items.dto.js';
import type { UpdateGroupDto } from './dto/update-group.dto.js';
import { recalculateReview } from './receipt-review-recalc.js';
import {
  mapDetail,
  mapGroupSummary,
  type ReceiptAccessDto,
  type ReceiptGroupDetailDto,
  type ReceiptsComparisonDto,
  type ReceiptsMonthListDto,
  type ReceiptsSummaryDto,
  type SignedImage,
} from './receipts.mappers.js';

const FIRST_POSITION = 1;
const EDITABLE_STATUSES: ReadonlySet<string> = new Set([
  'ready',
  'needs_review',
]);

const toNumericString = (value: number | null | undefined): string | null =>
  value === null || value === undefined ? null : String(value);

@Injectable()
export class ReceiptsService {
  constructor(
    private readonly allowedSenders: AllowedSendersRepository,
    private readonly groups: ReceiptGroupsRepository,
    private readonly items: ReceiptItemsRepository,
    private readonly images: ReceiptImagesRepository,
    private readonly extractions: ReceiptExtractionsRepository,
    private readonly products: ReceiptProductsRepository,
    private readonly merchants: ReceiptMerchantsRepository,
    private readonly queries: ReceiptQueryRepository,
    private readonly storage: ReceiptStorageService,
    private readonly queue: ReceiptQueueService,
    private readonly config: ReceiptConfigService,
  ) {}

  async getAccess(userId: string): Promise<ReceiptAccessDto> {
    const sender = await this.allowedSenders.findEnabledByUserId(userId);
    return { enabled: sender !== undefined };
  }

  async listForMonth(
    coupleId: string,
    year: number,
    month: number,
  ): Promise<ReceiptsMonthListDto> {
    const [groups, undated] = await Promise.all([
      this.queries.listGroupsForMonth(coupleId, year, month),
      this.queries.listUndatedGroups(coupleId),
    ]);
    return {
      groups: groups.map(mapGroupSummary),
      undated: undated.map(mapGroupSummary),
    };
  }

  async getDetail(
    coupleId: string,
    groupId: string,
  ): Promise<ReceiptGroupDetailDto> {
    const group = await this.requireGroup(coupleId, groupId);
    const [items, images, extraction, merchant] = await Promise.all([
      this.items.listByGroup(group.id),
      this.images.listByGroup(group.id),
      this.extractions.findLatestSucceeded(group.id),
      group.merchantId ? this.merchants.findById(group.merchantId) : undefined,
    ]);
    const [signedImages, productNames] = await Promise.all([
      this.signImages(images),
      this.productNamesFor(coupleId, items),
    ]);
    return mapDetail({
      group,
      merchantName: merchant?.canonicalName ?? null,
      items,
      productNames,
      images: signedImages,
      extraction,
      expiresInSeconds: this.config.signedUrlTtlSeconds,
    });
  }

  async updateHeader(
    coupleId: string,
    groupId: string,
    dto: UpdateGroupDto,
  ): Promise<ReceiptGroupDetailDto> {
    const group = await this.requireGroup(coupleId, groupId);
    this.assertEditable(group, dto.status);
    await this.groups.updateHeader(group.id, this.toHeaderPatch(dto));
    if (dto.status) {
      await this.groups.setStatusAndReasons(group.id, dto.status, []);
    } else {
      await this.recalculate(coupleId, group.id);
    }
    return this.getDetail(coupleId, groupId);
  }

  async replaceItems(
    coupleId: string,
    groupId: string,
    dto: ReplaceItemsDto,
  ): Promise<ReceiptGroupDetailDto> {
    const group = await this.requireGroup(coupleId, groupId);
    this.assertEditable(group);
    await this.assertProductsBelong(coupleId, dto.items);
    const previous = await this.items.listByGroup(group.id);
    await this.items.replaceForGroup(
      group.id,
      dto.items.map((item, index) => this.toNewItem(group, item, index)),
    );
    await this.learnAliases(previous, dto.items);
    await this.recalculate(coupleId, group.id);
    return this.getDetail(coupleId, groupId);
  }

  async requestNormalization(
    coupleId: string,
    groupId: string,
  ): Promise<{ enqueued: true }> {
    const group = await this.requireGroup(coupleId, groupId);
    this.assertEditable(group);
    await this.queue.enqueueNormalizeGroup({ groupId: group.id, coupleId });
    return { enqueued: true };
  }

  summary(
    coupleId: string,
    year: number,
    month: number,
  ): Promise<ReceiptsSummaryDto> {
    return this.queries.summaryForMonth(coupleId, year, month);
  }

  async comparison(
    coupleId: string,
    months: number,
  ): Promise<ReceiptsComparisonDto> {
    return { months: await this.queries.comparison(coupleId, months) };
  }

  private async requireGroup(
    coupleId: string,
    groupId: string,
  ): Promise<ReceiptGroup> {
    const group = await this.groups.findByIdForCouple(groupId, coupleId);
    if (!group) throw new NotFoundException('Boleta no encontrada');
    return group;
  }

  private assertEditable(group: ReceiptGroup, nextStatus?: string): void {
    if (EDITABLE_STATUSES.has(group.status)) return;
    if (group.status === 'discarded' && nextStatus === 'ready') return;
    throw new ConflictException(
      `La boleta no se puede editar en estado ${group.status}`,
    );
  }

  private toHeaderPatch(dto: UpdateGroupDto): ReceiptGroupHeaderPatch {
    const patch: ReceiptGroupHeaderPatch = {};
    if (dto.receiptDate !== undefined) patch.receiptDate = dto.receiptDate;
    if (dto.merchantRaw !== undefined) patch.merchantRaw = dto.merchantRaw;
    if (dto.totalDeclared !== undefined) {
      patch.totalDeclared = toNumericString(dto.totalDeclared);
    }
    return patch;
  }

  private async recalculate(coupleId: string, groupId: string): Promise<void> {
    const group = await this.requireGroup(coupleId, groupId);
    const [items, extraction] = await Promise.all([
      this.items.listByGroup(group.id),
      this.extractions.findLatestSucceeded(group.id),
    ]);
    const verdict = recalculateReview(
      {
        total:
          group.totalDeclared === null ? null : Number(group.totalDeclared),
        itemAmounts: items.map((item) => Number(item.amount)),
        confidence:
          extraction?.confidence === null ||
          extraction?.confidence === undefined
            ? null
            : Number(extraction.confidence),
        sourceKind: group.sourceKind,
        receiptDate: group.receiptDate,
      },
      {
        minConfidence: this.config.minConfidence,
        totalToleranceClp: this.config.totalToleranceClp,
      },
    );
    await this.groups.setStatusAndReasons(
      group.id,
      verdict.status,
      verdict.reasons,
    );
  }

  private async assertProductsBelong(
    coupleId: string,
    items: ReplaceItemDto[],
  ): Promise<void> {
    const ids = [
      ...new Set(
        items
          .map((item) => item.productId)
          .filter((id): id is string => typeof id === 'string'),
      ),
    ];
    const found = await this.products.listByIds(coupleId, ids);
    if (found.length !== ids.length) {
      throw new BadRequestException('Producto no pertenece a tu pareja');
    }
  }

  private toNewItem(
    group: ReceiptGroup,
    item: ReplaceItemDto,
    index: number,
  ): NewReceiptItem {
    return {
      groupId: group.id,
      coupleId: group.coupleId,
      descriptionRaw: item.descriptionRaw,
      productId: item.productId ?? null,
      category: item.category,
      qty: toNumericString(item.qty),
      unitPrice: toNumericString(item.unitPrice),
      amount: String(item.amount),
      confidence: null,
      sourceImageId: null,
      position: index + FIRST_POSITION,
    };
  }

  private async learnAliases(
    previous: ReceiptItem[],
    next: ReplaceItemDto[],
  ): Promise<void> {
    const previousByPosition = new Map(
      previous.map((item) => [item.position, item.productId]),
    );
    const corrections = next.filter(
      (item, index) =>
        item.productId !== undefined &&
        previousByPosition.get(index + FIRST_POSITION) !== item.productId,
    );
    for (const item of corrections) {
      const alias = toCanonicalName(item.descriptionRaw);
      if (item.productId && alias.length > 0) {
        await this.products.addAlias(item.productId, alias);
      }
    }
  }

  private async signImages(images: ReceiptImage[]): Promise<SignedImage[]> {
    return Promise.all(
      images.map(async (image) => ({
        image,
        signedUrl: await this.storage.createSignedUrl(image.storagePath),
      })),
    );
  }

  private async productNamesFor(
    coupleId: string,
    items: ReceiptItem[],
  ): Promise<Map<string, string>> {
    const ids = items
      .map((item) => item.productId)
      .filter((id): id is string => typeof id === 'string');
    const products = await this.products.listByIds(coupleId, [...new Set(ids)]);
    return new Map(
      products.map((product) => [product.id, product.canonicalName]),
    );
  }
}
