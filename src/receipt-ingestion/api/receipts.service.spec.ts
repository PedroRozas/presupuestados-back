import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { ReceiptsService } from './receipts.service.js';
import type { AllowedSendersRepository } from '../repository/allowed-senders.repository.js';
import type { ReceiptGroupsRepository } from '../repository/receipt-groups.repository.js';
import type { ReceiptItemsRepository } from '../repository/receipt-items.repository.js';
import type { ReceiptImagesRepository } from '../repository/receipt-images.repository.js';
import type { ReceiptExtractionsRepository } from '../repository/receipt-extractions.repository.js';
import type { ReceiptProductsRepository } from '../repository/receipt-products.repository.js';
import type { ReceiptMerchantsRepository } from '../repository/receipt-merchants.repository.js';
import type {
  GroupListRow,
  ReceiptQueryRepository,
} from '../repository/receipt-query.repository.js';
import type { ReceiptStorageService } from '../storage/receipt-storage.service.js';
import type { ReceiptQueueService } from '../queue/receipt-queue.service.js';
import type { ReceiptConfigService } from '../receipt.config.js';
import type {
  ReceiptExtraction,
  ReceiptGroup,
  ReceiptImage,
  ReceiptItem,
} from '../../database/schema/index.js';

const NOW = new Date('2026-09-05T12:00:00.000Z');

const group = (overrides: Partial<ReceiptGroup> = {}): ReceiptGroup =>
  ({
    id: 'g1',
    coupleId: 'c1',
    status: 'ready',
    senderAddress: 'tg:12345',
    receiptDate: '2026-09-01',
    merchantId: 'm1',
    merchantRaw: 'JUMBO',
    totalDeclared: '3480',
    currency: 'CLP',
    sourceKind: 'printed',
    reviewReasons: [],
    createdAt: NOW,
    closedAt: NOW,
    ...overrides,
  }) as ReceiptGroup;

const item = (overrides: Partial<ReceiptItem> = {}): ReceiptItem =>
  ({
    id: 'i1',
    groupId: 'g1',
    coupleId: 'c1',
    descriptionRaw: 'LECHE',
    productId: 'p1',
    category: 'lacteos_huevos',
    qty: null,
    unitPrice: null,
    amount: '1290',
    confidence: '0.99',
    position: 1,
    ...overrides,
  }) as ReceiptItem;

const listRow = (id: string): GroupListRow => ({
  id,
  status: 'ready',
  channel: 'telegram',
  receiptDate: '2026-09-01',
  merchantRaw: 'JUMBO',
  merchantName: 'JUMBO',
  totalDeclared: '3480',
  reviewReasons: [],
  pageCount: 1,
  itemCount: 2,
  createdAt: NOW,
  closedAt: NOW,
});

const build = (overrides: {
  group?: ReceiptGroup | undefined;
  items?: ReceiptItem[];
  products?: { id: string; canonicalName: string }[];
  extraction?: Partial<ReceiptExtraction>;
}) => {
  const allowedSenders = {
    findEnabledByUserId: jest.fn(() => Promise.resolve({ id: 's1' })),
  };
  const groups = {
    findByIdForCouple: jest.fn(() =>
      Promise.resolve('group' in overrides ? overrides.group : group()),
    ),
    updateHeader: jest.fn(() => Promise.resolve()),
    setStatusAndReasons: jest.fn(() => Promise.resolve()),
  };
  const items = {
    listByGroup: jest.fn(() => Promise.resolve(overrides.items ?? [item()])),
    replaceForGroup: jest.fn(() => Promise.resolve()),
  };
  const images = {
    listByGroup: jest.fn(() =>
      Promise.resolve([
        {
          id: 'img1',
          pageIndex: 1,
          width: 900,
          height: 1400,
          storagePath: 'c1/2026/09/g1/1.webp',
        } as ReceiptImage,
      ]),
    ),
  };
  const extractions = {
    findLatestSucceeded: jest.fn(() =>
      Promise.resolve({
        model: 'gpt-x',
        promptVersion: 'v1',
        confidence: '0.95',
        tokensIn: 10,
        tokensOut: 5,
        latencyMs: 100,
        rawJson: { warnings: ['borroso', 3] },
        ...overrides.extraction,
      } as ReceiptExtraction),
    ),
  };
  const products = {
    listByIds: jest.fn(() =>
      Promise.resolve(
        overrides.products ?? [{ id: 'p1', canonicalName: 'LECHE ENTERA 1L' }],
      ),
    ),
    addAlias: jest.fn(() => Promise.resolve()),
  };
  const merchants = {
    findById: jest.fn(() =>
      Promise.resolve({ id: 'm1', canonicalName: 'JUMBO LA REINA' }),
    ),
  };
  const queries = {
    listGroupsForMonth: jest.fn(() => Promise.resolve([listRow('g1')])),
    listUndatedGroups: jest.fn(() => Promise.resolve([listRow('g2')])),
    summaryForMonth: jest.fn(() =>
      Promise.resolve({ total: '3480', receiptCount: 1, byCategory: [] }),
    ),
    comparison: jest.fn(() => Promise.resolve([])),
  };
  const storage = {
    createSignedUrl: jest.fn((path: string) =>
      Promise.resolve(`https://signed/${path}`),
    ),
  };
  const queue = { enqueueNormalizeGroup: jest.fn(() => Promise.resolve()) };
  const config = {
    signedUrlTtlSeconds: 300,
    minConfidence: 0.85,
    totalToleranceClp: 50,
  };

  const service = new ReceiptsService(
    allowedSenders as unknown as AllowedSendersRepository,
    groups as unknown as ReceiptGroupsRepository,
    items as unknown as ReceiptItemsRepository,
    images as unknown as ReceiptImagesRepository,
    extractions as unknown as ReceiptExtractionsRepository,
    products as unknown as ReceiptProductsRepository,
    merchants as unknown as ReceiptMerchantsRepository,
    queries as unknown as ReceiptQueryRepository,
    storage as unknown as ReceiptStorageService,
    queue as unknown as ReceiptQueueService,
    config as unknown as ReceiptConfigService,
  );
  return {
    service,
    allowedSenders,
    groups,
    items,
    products,
    storage,
    queue,
    queries,
  };
};

describe('ReceiptsService', () => {
  it('informa acceso habilitado solo si el usuario está en la allowlist', async () => {
    const enabled = build({});
    await expect(enabled.service.getAccess('u1')).resolves.toEqual({
      enabled: true,
    });
    enabled.allowedSenders.findEnabledByUserId.mockResolvedValueOnce(
      undefined as never,
    );
    await expect(enabled.service.getAccess('u1')).resolves.toEqual({
      enabled: false,
    });
  });

  it('combina las boletas del mes con las sin fecha', async () => {
    const { service } = build({});
    const result = await service.listForMonth('c1', 2026, 9);
    expect(result.groups.map((g) => g.id)).toEqual(['g1']);
    expect(result.undated.map((g) => g.id)).toEqual(['g2']);
    expect(result.groups[0]?.createdAt).toBe(NOW.toISOString());
  });

  it('responde 404 cuando la boleta es de otra pareja o no existe', async () => {
    const { service } = build({ group: undefined });
    await expect(service.getDetail('c1', 'g1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('firma una URL por imagen sin exponer el path y resuelve nombres de producto y comercio', async () => {
    const { service, storage } = build({});
    const detail = await service.getDetail('c1', 'g1');
    expect(storage.createSignedUrl).toHaveBeenCalledWith(
      'c1/2026/09/g1/1.webp',
    );
    expect(detail.images).toEqual([
      {
        id: 'img1',
        pageIndex: 1,
        width: 900,
        height: 1400,
        signedUrl: 'https://signed/c1/2026/09/g1/1.webp',
        expiresInSeconds: 300,
      },
    ]);
    expect(JSON.stringify(detail)).not.toContain('storagePath');
    expect(detail.items[0]?.productName).toBe('LECHE ENTERA 1L');
    expect(detail.merchantName).toBe('JUMBO LA REINA');
    expect(detail.extraction?.warnings).toEqual(['borroso']);
  });

  it('con status discarded fija el estado sin recalcular', async () => {
    const { service, groups } = build({});
    await service.updateHeader('c1', 'g1', { status: 'discarded' });
    expect(groups.setStatusAndReasons).toHaveBeenCalledWith(
      'g1',
      'discarded',
      [],
    );
    expect(groups.setStatusAndReasons).toHaveBeenCalledTimes(1);
  });

  it('sin status recalcula la revisión con los ítems y la extracción', async () => {
    const { service, groups } = build({ items: [item({ amount: '1000' })] });
    await service.updateHeader('c1', 'g1', { merchantRaw: 'LIDER' });
    expect(groups.updateHeader).toHaveBeenCalledWith('g1', {
      merchantRaw: 'LIDER',
      merchantId: null,
    });
    expect(groups.setStatusAndReasons).toHaveBeenCalledWith(
      'g1',
      'needs_review',
      ['total_mismatch'],
    );
  });

  it('conserva el comercio normalizado cuando merchantRaw no cambia', async () => {
    const { service, groups } = build({});
    await service.updateHeader('c1', 'g1', { merchantRaw: 'JUMBO' });
    expect(groups.updateHeader).toHaveBeenCalledWith('g1', {});
  });

  it('permite descartar una boleta fallida pero no editarla', async () => {
    const failed = build({ group: group({ status: 'failed' }) });
    await expect(
      failed.service.updateHeader('c1', 'g1', { merchantRaw: 'X' }),
    ).rejects.toBeInstanceOf(ConflictException);
    await expect(
      failed.service.updateHeader('c1', 'g1', { status: 'discarded' }),
    ).resolves.toBeDefined();
  });

  it('assertAccess lanza Forbidden para un usuario fuera de la allowlist', async () => {
    const { service, allowedSenders } = build({});
    await expect(service.assertAccess('u1')).resolves.toBeUndefined();
    allowedSenders.findEnabledByUserId.mockResolvedValueOnce(undefined);
    await expect(service.assertAccess('u2')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('rechaza editar una boleta descartada salvo para reabrirla', async () => {
    const discarded = build({ group: group({ status: 'discarded' }) });
    await expect(
      discarded.service.updateHeader('c1', 'g1', { merchantRaw: 'X' }),
    ).rejects.toBeInstanceOf(ConflictException);
    await expect(
      discarded.service.updateHeader('c1', 'g1', { status: 'ready' }),
    ).resolves.toBeDefined();
  });

  it('rechaza un producto de otra pareja al reemplazar ítems', async () => {
    const { service } = build({ products: [] });
    await expect(
      service.replaceItems('c1', 'g1', {
        items: [
          {
            descriptionRaw: 'X',
            category: 'otros',
            amount: 100,
            productId: 'p-ajeno',
          },
        ],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('reescribe los ítems, aprende el alias del producto corregido y recalcula', async () => {
    const { service, items, products, groups } = build({
      items: [item({ productId: null })],
      products: [{ id: 'p1', canonicalName: 'LECHE ENTERA 1L' }],
    });
    await service.replaceItems('c1', 'g1', {
      items: [
        {
          descriptionRaw: 'Leche ent. 1lt',
          category: 'lacteos_huevos',
          amount: 1290,
          productId: 'p1',
        },
        { descriptionRaw: 'PAN', category: 'panaderia', amount: 2190 },
      ],
    });
    expect(items.replaceForGroup).toHaveBeenCalledWith(
      'g1',
      expect.arrayContaining([
        expect.objectContaining({
          position: 1,
          productId: 'p1',
          amount: '1290',
        }),
        expect.objectContaining({
          position: 2,
          productId: null,
          amount: '2190',
        }),
      ]),
    );
    expect(products.addAlias).toHaveBeenCalledWith('p1', 'LECHE ENT. 1LT');
    expect(groups.setStatusAndReasons).toHaveBeenCalled();
  });

  it('encola la re-normalización de una boleta propia', async () => {
    const { service, queue } = build({});
    await expect(service.requestNormalization('c1', 'g1')).resolves.toEqual({
      enqueued: true,
    });
    expect(queue.enqueueNormalizeGroup).toHaveBeenCalledWith({
      groupId: 'g1',
      coupleId: 'c1',
    });
  });

  it('delega resumen y comparación al repositorio de consultas', async () => {
    const { service, queries } = build({});
    await expect(service.summary('c1', 2026, 9)).resolves.toEqual({
      total: '3480',
      receiptCount: 1,
      byCategory: [],
    });
    await service.comparison('c1', 6);
    expect(queries.comparison).toHaveBeenCalledWith('c1', 6);
  });
});
