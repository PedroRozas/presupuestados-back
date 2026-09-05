import { ExtractionService } from './extraction.service.js';
import { ExtractionOutputInvalidError } from './extraction-output.schema.js';
import type { ReceiptGroupsRepository } from '../repository/receipt-groups.repository.js';
import type { ReceiptImagesRepository } from '../repository/receipt-images.repository.js';
import type { ReceiptExtractionsRepository } from '../repository/receipt-extractions.repository.js';
import type { ReceiptItemsRepository } from '../repository/receipt-items.repository.js';
import type { ExtractionUsageRepository } from './extraction-usage.repository.js';
import type { ReceiptStorageService } from '../storage/receipt-storage.service.js';
import type { LlmExtractionProvider } from '../llm/llm.interfaces.js';
import type { ReceiptConfigService } from '../receipt.config.js';
import type {
  ReceiptGroup,
  ReceiptImage,
} from '../../database/schema/index.js';

const group = (overrides: Partial<ReceiptGroup> = {}): ReceiptGroup =>
  ({
    id: 'g1',
    coupleId: 'c1',
    status: 'extracting',
    ...overrides,
  }) as ReceiptGroup;
const image = (pageIndex: number): ReceiptImage =>
  ({
    id: `img-${pageIndex}`,
    groupId: 'g1',
    storagePath: `c1/2026/09/g1/${pageIndex}.webp`,
    pageIndex,
  }) as ReceiptImage;

const modelOutput = {
  merchant_raw: 'JUMBO',
  merchant_rut: null,
  receipt_date: '2026-09-01',
  total: 3480,
  currency: 'CLP',
  source_kind: 'printed',
  items: [
    {
      description_raw: 'LECHE',
      qty: 1,
      unit_price: 1290,
      amount: 1290,
      category: 'lacteos_huevos',
      confidence: 0.9,
    },
    {
      description_raw: 'PAN',
      qty: null,
      unit_price: null,
      amount: 2190,
      category: 'panaderia',
      confidence: 0.9,
    },
  ],
  confidence: 0.95,
  warnings: [],
};

const build = (options: {
  group?: ReceiptGroup | undefined;
  images?: ReceiptImage[];
  reserve?: boolean;
  rawText?: string;
  providerError?: Error;
}) => {
  const groups = {
    findById: jest.fn(() => Promise.resolve(options.group)),
    applyExtraction: jest.fn(() => Promise.resolve()),
    markFailed: jest.fn(() => Promise.resolve()),
  };
  const images = {
    listByGroup: jest.fn(() =>
      Promise.resolve(options.images ?? [image(1), image(2)]),
    ),
  };
  const extractions = {
    create: jest.fn((values: unknown) =>
      Promise.resolve({ id: 'x1', ...(values as object) }),
    ),
  };
  const items = { replaceForGroup: jest.fn(() => Promise.resolve()) };
  const usage = {
    tryReserve: jest.fn(() => Promise.resolve(options.reserve ?? true)),
  };
  const storage = {
    download: jest.fn((path: string) => Promise.resolve(Buffer.from(path))),
  };
  const provider = {
    extract: jest.fn(() =>
      options.providerError
        ? Promise.reject(options.providerError)
        : Promise.resolve({
            rawText: options.rawText ?? JSON.stringify(modelOutput),
            model: 'test-model',
            tokensIn: 100,
            tokensOut: 50,
            latencyMs: 1234,
          }),
    ),
  };
  const config = {
    extractionMaxOutputTokens: 8000,
    extractionTimeoutMs: 90000,
    minConfidence: 0.85,
    totalToleranceClp: 50,
    monthlyExtractionCap: 300,
  } as ReceiptConfigService;

  const service = new ExtractionService(
    groups as unknown as ReceiptGroupsRepository,
    images as unknown as ReceiptImagesRepository,
    extractions as unknown as ReceiptExtractionsRepository,
    items as unknown as ReceiptItemsRepository,
    usage as unknown as ExtractionUsageRepository,
    storage as unknown as ReceiptStorageService,
    provider as unknown as LlmExtractionProvider,
    config,
  );
  return {
    service,
    groups,
    images,
    extractions,
    items,
    usage,
    storage,
    provider,
  };
};

describe('ExtractionService.extractGroup', () => {
  const input = { groupId: 'g1', coupleId: 'c1', attempt: 1 };

  it('descarga las imágenes en orden, llama al modelo y persiste extracción, ítems y cabecera', async () => {
    const { service, storage, provider, extractions, items, groups } = build({
      group: group(),
    });

    const result = await service.extractGroup(input);

    expect(storage.download).toHaveBeenNthCalledWith(1, 'c1/2026/09/g1/1.webp');
    expect(storage.download).toHaveBeenNthCalledWith(2, 'c1/2026/09/g1/2.webp');
    const call = (
      (provider.extract as jest.Mock).mock.calls[0] as unknown[]
    )?.[0] as {
      images: unknown[];
      maxOutputTokens: number;
    };
    expect(call.images).toHaveLength(2);
    expect(call.maxOutputTokens).toBe(8000);
    expect(extractions.create).toHaveBeenCalledWith(
      expect.objectContaining({
        groupId: 'g1',
        coupleId: 'c1',
        model: 'test-model',
        promptVersion: 'v1',
        status: 'succeeded',
        tokensIn: 100,
        tokensOut: 50,
        latencyMs: 1234,
        attempt: 1,
        confidence: '0.95',
      }),
    );
    expect(items.replaceForGroup).toHaveBeenCalledWith('g1', [
      expect.objectContaining({
        groupId: 'g1',
        coupleId: 'c1',
        descriptionRaw: 'LECHE',
        amount: '1290',
        qty: '1',
        unitPrice: '1290',
        category: 'lacteos_huevos',
        position: 1,
        sourceImageId: null,
      }),
      expect.objectContaining({
        descriptionRaw: 'PAN',
        amount: '2190',
        qty: null,
        unitPrice: null,
        category: 'panaderia',
        position: 2,
      }),
    ]);
    expect(groups.applyExtraction).toHaveBeenCalledWith('g1', {
      status: 'ready',
      reviewReasons: [],
      merchantRaw: 'JUMBO',
      receiptDate: '2026-09-01',
      totalDeclared: '3480',
      currency: 'CLP',
      sourceKind: 'printed',
    });
    expect(result).toEqual({
      outcome: 'extracted',
      status: 'ready',
      reasons: [],
      summary: {
        merchantRaw: 'JUMBO',
        receiptDate: '2026-09-01',
        total: 3480,
        itemCount: 2,
      },
    });
  });

  it('marca needs_review con los motivos cuando las reglas lo exigen', async () => {
    const { service, groups } = build({
      group: group(),
      rawText: JSON.stringify({
        ...modelOutput,
        receipt_date: null,
        confidence: 0.5,
      }),
    });

    const result = await service.extractGroup(input);

    expect(result).toEqual(
      expect.objectContaining({
        status: 'needs_review',
        reasons: ['low_confidence', 'missing_date'],
      }),
    );
    expect(groups.applyExtraction).toHaveBeenCalledWith(
      'g1',
      expect.objectContaining({ status: 'needs_review', receiptDate: null }),
    );
  });

  it('omite grupos inexistentes o que no están en extracting', async () => {
    await expect(
      build({ group: undefined }).service.extractGroup(input),
    ).resolves.toEqual({ outcome: 'skipped', reason: 'not_found' });
    await expect(
      build({ group: group({ status: 'ready' }) }).service.extractGroup(input),
    ).resolves.toEqual({ outcome: 'skipped', reason: 'not_extracting' });
  });

  it('omite grupos de otra pareja como not_found sin llamar al modelo', async () => {
    const { service, provider } = build({
      group: group({ coupleId: 'other' }),
    });

    await expect(service.extractGroup(input)).resolves.toEqual({
      outcome: 'skipped',
      reason: 'not_found',
    });
    expect(provider.extract).not.toHaveBeenCalled();
  });

  it('marca failed sin llamar al modelo si el grupo no tiene imágenes', async () => {
    const { service, groups, provider } = build({ group: group(), images: [] });

    await expect(service.extractGroup(input)).resolves.toEqual({
      outcome: 'skipped',
      reason: 'no_images',
    });
    expect(groups.markFailed).toHaveBeenCalledWith('g1', ['extraction_failed']);
    expect(provider.extract).not.toHaveBeenCalled();
  });

  it('marca failed con monthly_cap y no llama al modelo si se agotó el tope', async () => {
    const { service, groups, provider } = build({
      group: group(),
      reserve: false,
    });

    await expect(service.extractGroup(input)).resolves.toEqual({
      outcome: 'monthly_cap',
    });
    expect(groups.markFailed).toHaveBeenCalledWith('g1', ['monthly_cap']);
    expect(provider.extract).not.toHaveBeenCalled();
  });

  it('registra la extracción fallida y propaga si el JSON no valida', async () => {
    const { service, extractions, groups } = build({
      group: group(),
      rawText: '{"bad": true}',
    });

    await expect(service.extractGroup(input)).rejects.toBeInstanceOf(
      ExtractionOutputInvalidError,
    );
    expect(extractions.create).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'failed', attempt: 1 }),
    );
    expect(groups.applyExtraction).not.toHaveBeenCalled();
  });

  it('registra la extracción fallida y propaga si el proveedor falla', async () => {
    const { service, extractions } = build({
      group: group(),
      providerError: new Error('timeout'),
    });

    await expect(service.extractGroup(input)).rejects.toThrow('timeout');
    expect(extractions.create).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'failed',
        error: 'timeout',
        tokensIn: 0,
      }),
    );
  });

  it('registra los tokens reales cuando el proveedor falla tras completar la llamada', async () => {
    const providerError = Object.assign(
      new Error('llm_incomplete_response reason=max_output_tokens'),
      {
        usage: {
          model: 'test-model',
          tokensIn: 42,
          tokensOut: 7,
          latencyMs: 1234,
        },
      },
    );
    const { service, extractions } = build({
      group: group(),
      providerError,
    });

    await expect(service.extractGroup(input)).rejects.toThrow(
      'llm_incomplete_response',
    );
    expect(extractions.create).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'failed',
        model: 'test-model',
        tokensIn: 42,
        tokensOut: 7,
        latencyMs: 1234,
      }),
    );
  });
});
