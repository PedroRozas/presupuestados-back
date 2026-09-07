import type {
  ReceiptExtraction,
  ReceiptGroup,
  ReceiptImage,
  ReceiptItem,
} from '../../database/schema/index.js';
import type {
  ReceiptGroupStatus,
  ReceiptSourceKind,
} from '../receipt.constants.js';
import type {
  ComparisonMonthRow,
  GroupListRow,
  MonthSummary,
} from '../repository/receipt-query.repository.js';

export interface ReceiptAccessDto {
  enabled: boolean;
}

export interface ReceiptGroupSummaryDto {
  id: string;
  status: ReceiptGroupStatus;
  receiptDate: string | null;
  merchantRaw: string | null;
  merchantName: string | null;
  totalDeclared: string | null;
  reviewReasons: string[];
  pageCount: number;
  itemCount: number;
  createdAt: string;
  closedAt: string | null;
}

export interface ReceiptItemDto {
  id: string;
  descriptionRaw: string;
  category: string;
  qty: string | null;
  unitPrice: string | null;
  amount: string;
  confidence: string | null;
  position: number;
  productId: string | null;
  productName: string | null;
}

export interface ReceiptImageDto {
  id: string;
  pageIndex: number;
  width: number;
  height: number;
  signedUrl: string;
  expiresInSeconds: number;
}

export interface ReceiptExtractionDto {
  model: string;
  promptVersion: string;
  confidence: string | null;
  tokensIn: number;
  tokensOut: number;
  latencyMs: number;
  warnings: string[];
}

export interface ReceiptGroupDetailDto extends ReceiptGroupSummaryDto {
  currency: string;
  sourceKind: ReceiptSourceKind;
  items: ReceiptItemDto[];
  images: ReceiptImageDto[];
  extraction: ReceiptExtractionDto | null;
}

export interface ReceiptsMonthListDto {
  groups: ReceiptGroupSummaryDto[];
  undated: ReceiptGroupSummaryDto[];
}

export type ReceiptsSummaryDto = MonthSummary;
export type ReceiptsComparisonDto = { months: ComparisonMonthRow[] };

export interface SignedImage {
  image: ReceiptImage;
  signedUrl: string;
}

export const mapGroupSummary = (row: GroupListRow): ReceiptGroupSummaryDto => ({
  id: row.id,
  status: row.status,
  receiptDate: row.receiptDate,
  merchantRaw: row.merchantRaw,
  merchantName: row.merchantName,
  totalDeclared: row.totalDeclared,
  reviewReasons: row.reviewReasons,
  pageCount: row.pageCount,
  itemCount: row.itemCount,
  createdAt: row.createdAt.toISOString(),
  closedAt: row.closedAt ? row.closedAt.toISOString() : null,
});

export const mapItem = (
  item: ReceiptItem,
  productName: string | null,
): ReceiptItemDto => ({
  id: item.id,
  descriptionRaw: item.descriptionRaw,
  category: item.category,
  qty: item.qty,
  unitPrice: item.unitPrice,
  amount: item.amount,
  confidence: item.confidence,
  position: item.position,
  productId: item.productId,
  productName,
});

export const mapImage = (
  signed: SignedImage,
  expiresInSeconds: number,
): ReceiptImageDto => ({
  id: signed.image.id,
  pageIndex: signed.image.pageIndex,
  width: signed.image.width,
  height: signed.image.height,
  signedUrl: signed.signedUrl,
  expiresInSeconds,
});

const readWarnings = (rawJson: unknown): string[] => {
  if (typeof rawJson !== 'object' || rawJson === null) return [];
  const warnings = (rawJson as { warnings?: unknown }).warnings;
  return Array.isArray(warnings)
    ? warnings.filter((entry): entry is string => typeof entry === 'string')
    : [];
};

export const mapExtraction = (
  extraction: ReceiptExtraction | undefined,
): ReceiptExtractionDto | null =>
  extraction
    ? {
        model: extraction.model,
        promptVersion: extraction.promptVersion,
        confidence: extraction.confidence,
        tokensIn: extraction.tokensIn,
        tokensOut: extraction.tokensOut,
        latencyMs: extraction.latencyMs,
        warnings: readWarnings(extraction.rawJson),
      }
    : null;

export interface DetailParts {
  group: ReceiptGroup;
  merchantName: string | null;
  items: ReceiptItem[];
  productNames: Map<string, string>;
  images: SignedImage[];
  extraction: ReceiptExtraction | undefined;
  expiresInSeconds: number;
}

export const mapDetail = (parts: DetailParts): ReceiptGroupDetailDto => ({
  id: parts.group.id,
  status: parts.group.status,
  receiptDate: parts.group.receiptDate,
  merchantRaw: parts.group.merchantRaw,
  merchantName: parts.merchantName,
  totalDeclared: parts.group.totalDeclared,
  reviewReasons: parts.group.reviewReasons,
  pageCount: parts.images.length,
  itemCount: parts.items.length,
  createdAt: parts.group.createdAt.toISOString(),
  closedAt: parts.group.closedAt ? parts.group.closedAt.toISOString() : null,
  currency: parts.group.currency,
  sourceKind: parts.group.sourceKind,
  items: parts.items.map((item) =>
    mapItem(
      item,
      item.productId ? (parts.productNames.get(item.productId) ?? null) : null,
    ),
  ),
  images: parts.images.map((signed) =>
    mapImage(signed, parts.expiresInSeconds),
  ),
  extraction: mapExtraction(parts.extraction),
});
