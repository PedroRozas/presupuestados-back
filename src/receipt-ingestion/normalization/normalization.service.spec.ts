import { NormalizationService } from './normalization.service.js';
import type { ReceiptGroupsRepository } from '../repository/receipt-groups.repository.js';
import type { ReceiptItemsRepository } from '../repository/receipt-items.repository.js';
import type { ReceiptProductsRepository } from '../repository/receipt-products.repository.js';
import type { ReceiptMerchantsRepository } from '../repository/receipt-merchants.repository.js';
import type { ReceiptExtractionsRepository } from '../repository/receipt-extractions.repository.js';
import type { LlmNormalizationProvider } from '../llm/llm.interfaces.js';
import type { ReceiptConfigService } from '../receipt.config.js';
import type {
  ReceiptGroup,
  ReceiptItem,
  ReceiptMerchant,
} from '../../database/schema/index.js';
import type { ScoredCandidate } from './match-decision.js';

const group = (overrides: Partial<ReceiptGroup> = {}): ReceiptGroup =>
  ({
    id: 'g1',
    coupleId: 'c1',
    status: 'ready',
    merchantId: null,
    merchantRaw: null,
    merchantRut: null,
    ...overrides,
  }) as ReceiptGroup;

const firstCallArg = <T>(fn: jest.Mock<unknown, unknown[]>): T =>
  fn.mock.calls[0]?.[0] as T;

const item = (overrides: Partial<ReceiptItem> = {}): ReceiptItem =>
  ({
    id: 'i1',
    groupId: 'g1',
    coupleId: 'c1',
    descriptionRaw: 'LECHE',
    productId: null,
    category: 'lacteos_huevos',
    position: 1,
    ...overrides,
  }) as ReceiptItem;

interface BuildOptions {
  group?: ReceiptGroup;
  items?: ReceiptItem[];
  merchantByRut?: ReceiptMerchant;
  merchantCandidates?: ScoredCandidate[];
  productCandidatesByText?: Record<string, ScoredCandidate[]>;
  chooseCandidatesResult?: {
    decisions: { key: string; candidate_id: string | null }[];
  };
  providerError?: Error;
}

const build = (options: BuildOptions) => {
  const groups = {
    findById: jest.fn(() => Promise.resolve(options.group)),
    setMerchant: jest.fn(() => Promise.resolve()),
  };
  const items = {
    listByGroup: jest.fn(() => Promise.resolve(options.items ?? [])),
    setProduct: jest.fn(() => Promise.resolve()),
  };
  const products = {
    findCandidates: jest.fn((_coupleId: string, text: string) =>
      Promise.resolve(options.productCandidatesByText?.[text] ?? []),
    ),
    create: jest.fn(
      (coupleId: string, canonicalName: string, category: string) =>
        Promise.resolve({
          id: `product-${canonicalName}`,
          coupleId,
          canonicalName,
          defaultCategory: category,
          aliases: [],
        }),
    ),
    addAlias: jest.fn(() => Promise.resolve()),
  };
  const merchants = {
    findByRut: jest.fn(() => Promise.resolve(options.merchantByRut)),
    findCandidates: jest.fn(() =>
      Promise.resolve(options.merchantCandidates ?? []),
    ),
    create: jest.fn(
      (coupleId: string, canonicalName: string, rut: string | null) =>
        Promise.resolve({
          id: `merchant-${canonicalName}`,
          coupleId,
          canonicalName,
          rut,
          aliases: [],
        }),
    ),
    addAlias: jest.fn(() => Promise.resolve()),
    setRut: jest.fn(() => Promise.resolve()),
  };
  const extractions = {
    create: jest.fn(() =>
      Promise.resolve({ id: 'extraction-1' } as unknown as never),
    ),
  };
  const provider = {
    chooseCandidates: jest.fn(() =>
      options.providerError
        ? Promise.reject(options.providerError)
        : Promise.resolve({
            rawText: JSON.stringify(
              options.chooseCandidatesResult ?? { decisions: [] },
            ),
            model: 'test-model',
            tokensIn: 10,
            tokensOut: 5,
            latencyMs: 100,
          }),
    ),
  };
  const config = {
    matchHigh: 0.6,
    matchLow: 0.3,
    candidateLimit: 5,
    normalizationMaxOutputTokens: 600,
    normalizationTimeoutMs: 30000,
    normalizationModel: 'test-model',
  } as ReceiptConfigService;

  const service = new NormalizationService(
    groups as unknown as ReceiptGroupsRepository,
    items as unknown as ReceiptItemsRepository,
    products as unknown as ReceiptProductsRepository,
    merchants as unknown as ReceiptMerchantsRepository,
    extractions as unknown as ReceiptExtractionsRepository,
    provider as unknown as LlmNormalizationProvider,
    config,
  );

  return { service, groups, items, products, merchants, extractions, provider };
};

describe('NormalizationService.normalizeGroup', () => {
  const input = { groupId: 'g1', coupleId: 'c1' };

  it('no registra descuentos como productos del catálogo', async () => {
    const { service, products, items } = build({
      group: group(),
      items: [
        item({ descriptionRaw: '6% DESCUENTO SALCOBRAND', amount: '-1500' }),
      ],
    });
    const result = await service.normalizeGroup(input);
    expect(result).toMatchObject({
      items: { matched: 0, created: 0, llmDecided: 0 },
    });
    expect(products.create).not.toHaveBeenCalled();
    expect(items.setProduct).not.toHaveBeenCalled();
  });

  it('crea merchant nuevo sin candidatos y resuelve dos ítems por trigram sin llamar al LLM', async () => {
    const { service, merchants, groups, products, items, provider } = build({
      group: group({ merchantRaw: 'Jumbo Nuevo' }),
      items: [
        item({ id: 'i1', descriptionRaw: 'Leche Full 1L' }),
        item({ id: 'i2', descriptionRaw: 'Producto Nuevo X' }),
      ],
      merchantCandidates: [],
      productCandidatesByText: {
        'LECHE FULL 1L': [{ id: 'p1', canonicalName: 'LECHE', score: 0.9 }],
        'PRODUCTO NUEVO X': [],
      },
    });

    const result = await service.normalizeGroup(input);

    expect(merchants.create).toHaveBeenCalledWith('c1', 'JUMBO NUEVO', null);
    expect(groups.setMerchant).toHaveBeenCalledWith(
      'g1',
      'merchant-JUMBO NUEVO',
    );
    expect(items.setProduct).toHaveBeenCalledWith('i1', 'p1');
    expect(products.addAlias).toHaveBeenCalledWith('p1', 'LECHE FULL 1L');
    expect(products.create).toHaveBeenCalledWith(
      'c1',
      'PRODUCTO NUEVO X',
      'lacteos_huevos',
    );
    expect(items.setProduct).toHaveBeenCalledWith(
      'i2',
      'product-PRODUCTO NUEVO X',
    );
    expect(provider.chooseCandidates).not.toHaveBeenCalled();
    expect(result).toEqual({
      outcome: 'normalized',
      merchant: 'created',
      items: { matched: 1, created: 1, llmDecided: 0 },
    });
  });

  it('resuelve merchant por rut existente sin trigram ni LLM, normalizando el rut para la búsqueda', async () => {
    const { service, merchants, groups, provider } = build({
      group: group({
        merchantRaw: 'Jumbo Providencia',
        merchantRut: '76.123.456-7',
      }),
      items: [],
      merchantByRut: {
        id: 'm1',
        coupleId: 'c1',
        canonicalName: 'JUMBO PROVIDENCIA',
        rut: '761234567',
        aliases: [],
      } as ReceiptMerchant,
    });

    const result = await service.normalizeGroup(input);

    expect(merchants.findByRut).toHaveBeenCalledWith('c1', '761234567');
    expect(merchants.findCandidates).not.toHaveBeenCalled();
    expect(groups.setMerchant).toHaveBeenCalledWith('g1', 'm1');
    expect(merchants.addAlias).not.toHaveBeenCalled();
    expect(merchants.setRut).toHaveBeenCalledWith('m1', '761234567');
    expect(provider.chooseCandidates).not.toHaveBeenCalled();
    expect(result).toEqual({
      outcome: 'normalized',
      merchant: 'matched',
      items: { matched: 0, created: 0, llmDecided: 0 },
    });
  });

  it('rellena el rut de un merchant existente resuelto por trigram', async () => {
    const { service, merchants } = build({
      group: group({
        merchantRaw: 'Jumbo Providencia',
        merchantRut: '76.123.456-7',
      }),
      items: [],
      merchantCandidates: [
        { id: 'm1', canonicalName: 'JUMBO PROVIDENCIA', score: 0.9 },
      ],
    });

    await service.normalizeGroup(input);

    expect(merchants.setRut).toHaveBeenCalledWith('m1', '761234567');
  });

  it('omite el merchant ya asignado sin llamar a repositorio ni LLM', async () => {
    const { service, merchants, groups, provider } = build({
      group: group({
        merchantId: 'm-existing',
        merchantRaw: 'Jumbo Providencia',
        merchantRut: '76.123.456-7',
      }),
      items: [],
    });

    const result = await service.normalizeGroup(input);

    expect(merchants.findByRut).not.toHaveBeenCalled();
    expect(merchants.findCandidates).not.toHaveBeenCalled();
    expect(merchants.create).not.toHaveBeenCalled();
    expect(groups.setMerchant).not.toHaveBeenCalled();
    expect(provider.chooseCandidates).not.toHaveBeenCalled();
    expect(result).toEqual({
      outcome: 'normalized',
      merchant: 'matched',
      items: { matched: 0, created: 0, llmDecided: 0 },
    });
  });

  it('omite un merchant cuyo texto canónico queda vacío sin buscar candidatos ni crear', async () => {
    const { service, merchants, groups } = build({
      group: group({ merchantRaw: '  ' }),
      items: [],
    });

    const result = await service.normalizeGroup(input);

    expect(merchants.findCandidates).not.toHaveBeenCalled();
    expect(merchants.create).not.toHaveBeenCalled();
    expect(groups.setMerchant).not.toHaveBeenCalled();
    expect(result.outcome).toBe('normalized');
    if (result.outcome === 'normalized') {
      expect(result.merchant).toBe('none');
    }
  });

  it('resuelve un ítem ambiguo con una llamada al LLM que devuelve un candidato y registra el gasto', async () => {
    const { service, provider, items, products, extractions } = build({
      group: group(),
      items: [item({ id: 'i1', descriptionRaw: 'Yogur Sabor Frutilla' })],
      productCandidatesByText: {
        'YOGUR SABOR FRUTILLA': [
          { id: 'p9', canonicalName: 'YOGUR FRUTILLA', score: 0.45 },
        ],
      },
      chooseCandidatesResult: {
        decisions: [{ key: 'i1', candidate_id: 'p9' }],
      },
    });

    const result = await service.normalizeGroup(input);

    expect(provider.chooseCandidates).toHaveBeenCalledTimes(1);
    const call = firstCallArg<{ questions: { key: string }[] }>(
      provider.chooseCandidates,
    );
    expect(call.questions).toHaveLength(1);
    expect(call.questions[0]?.key).toBe('i1');
    expect(items.setProduct).toHaveBeenCalledWith('i1', 'p9');
    expect(products.addAlias).toHaveBeenCalledWith(
      'p9',
      'YOGUR SABOR FRUTILLA',
    );
    expect(extractions.create).toHaveBeenCalledWith(
      expect.objectContaining({
        groupId: 'g1',
        coupleId: 'c1',
        promptVersion: 'norm-v1',
        model: 'test-model',
        tokensIn: 10,
        tokensOut: 5,
        latencyMs: 100,
        status: 'succeeded',
      }),
    );
    expect(result).toEqual({
      outcome: 'normalized',
      merchant: 'none',
      items: { matched: 1, created: 0, llmDecided: 1 },
    });
  });

  it('crea un producto nuevo cuando el LLM decide null para un ítem ambiguo', async () => {
    const { service, provider, items, products } = build({
      group: group(),
      items: [item({ id: 'i1', descriptionRaw: 'Yogur Sabor Frutilla' })],
      productCandidatesByText: {
        'YOGUR SABOR FRUTILLA': [
          { id: 'p9', canonicalName: 'YOGUR FRUTILLA', score: 0.45 },
        ],
      },
      chooseCandidatesResult: {
        decisions: [{ key: 'i1', candidate_id: null }],
      },
    });

    const result = await service.normalizeGroup(input);

    expect(provider.chooseCandidates).toHaveBeenCalledTimes(1);
    expect(products.create).toHaveBeenCalledWith(
      'c1',
      'YOGUR SABOR FRUTILLA',
      'lacteos_huevos',
    );
    expect(items.setProduct).toHaveBeenCalledWith(
      'i1',
      'product-YOGUR SABOR FRUTILLA',
    );
    expect(result).toEqual({
      outcome: 'normalized',
      merchant: 'none',
      items: { matched: 0, created: 1, llmDecided: 1 },
    });
  });

  it('crea un producto nuevo cuando la respuesta del LLM no incluye la key del ítem', async () => {
    const { service, provider, items, products } = build({
      group: group(),
      items: [item({ id: 'i1', descriptionRaw: 'Yogur Sabor Frutilla' })],
      productCandidatesByText: {
        'YOGUR SABOR FRUTILLA': [
          { id: 'p9', canonicalName: 'YOGUR FRUTILLA', score: 0.45 },
        ],
      },
      chooseCandidatesResult: { decisions: [] },
    });

    const result = await service.normalizeGroup(input);

    expect(provider.chooseCandidates).toHaveBeenCalledTimes(1);
    expect(products.create).toHaveBeenCalledWith(
      'c1',
      'YOGUR SABOR FRUTILLA',
      'lacteos_huevos',
    );
    expect(items.setProduct).toHaveBeenCalledWith(
      'i1',
      'product-YOGUR SABOR FRUTILLA',
    );
    expect(result).toEqual({
      outcome: 'normalized',
      merchant: 'none',
      items: { matched: 0, created: 1, llmDecided: 1 },
    });
  });

  it('crea un producto nuevo cuando el candidate_id del LLM no corresponde a ningún candidato', async () => {
    const { service, provider, items, products } = build({
      group: group(),
      items: [item({ id: 'i1', descriptionRaw: 'Yogur Sabor Frutilla' })],
      productCandidatesByText: {
        'YOGUR SABOR FRUTILLA': [
          { id: 'p9', canonicalName: 'YOGUR FRUTILLA', score: 0.45 },
        ],
      },
      chooseCandidatesResult: {
        decisions: [{ key: 'i1', candidate_id: 'no-existe' }],
      },
    });

    const result = await service.normalizeGroup(input);

    expect(provider.chooseCandidates).toHaveBeenCalledTimes(1);
    expect(products.create).toHaveBeenCalledWith(
      'c1',
      'YOGUR SABOR FRUTILLA',
      'lacteos_huevos',
    );
    expect(items.setProduct).toHaveBeenCalledWith(
      'i1',
      'product-YOGUR SABOR FRUTILLA',
    );
    expect(result).toEqual({
      outcome: 'normalized',
      merchant: 'none',
      items: { matched: 0, created: 1, llmDecided: 1 },
    });
  });

  it('resuelve un merchant ambiguo con una llamada al LLM que devuelve un candidato', async () => {
    const { service, provider, merchants, groups } = build({
      group: group({ merchantRaw: 'Jumbo Nueva Providencia' }),
      items: [],
      merchantCandidates: [
        { id: 'm9', canonicalName: 'JUMBO PROVIDENCIA', score: 0.45 },
      ],
      chooseCandidatesResult: {
        decisions: [{ key: 'merchant', candidate_id: 'm9' }],
      },
    });

    const result = await service.normalizeGroup(input);

    expect(provider.chooseCandidates).toHaveBeenCalledTimes(1);
    const call = firstCallArg<{ questions: { key: string }[] }>(
      provider.chooseCandidates,
    );
    expect(call.questions[0]?.key).toBe('merchant');
    expect(groups.setMerchant).toHaveBeenCalledWith('g1', 'm9');
    expect(merchants.addAlias).toHaveBeenCalledWith(
      'm9',
      'JUMBO NUEVA PROVIDENCIA',
    );
    expect(result).toEqual({
      outcome: 'normalized',
      merchant: 'matched',
      items: { matched: 0, created: 0, llmDecided: 0 },
    });
  });

  it('hace exactamente una llamada al proveedor con dos preguntas cuando hay dos ítems ambiguos', async () => {
    const { service, provider } = build({
      group: group(),
      items: [
        item({ id: 'i1', descriptionRaw: 'Yogur Sabor Frutilla' }),
        item({ id: 'i2', descriptionRaw: 'Queso Laminado' }),
      ],
      productCandidatesByText: {
        'YOGUR SABOR FRUTILLA': [
          { id: 'p9', canonicalName: 'YOGUR FRUTILLA', score: 0.45 },
        ],
        'QUESO LAMINADO': [
          { id: 'p8', canonicalName: 'QUESO LAMINA', score: 0.4 },
        ],
      },
      chooseCandidatesResult: {
        decisions: [
          { key: 'i1', candidate_id: 'p9' },
          { key: 'i2', candidate_id: null },
        ],
      },
    });

    await service.normalizeGroup(input);

    expect(provider.chooseCandidates).toHaveBeenCalledTimes(1);
    const call = firstCallArg<{ questions: { key: string }[] }>(
      provider.chooseCandidates,
    );
    expect(call.questions).toHaveLength(2);
  });

  it('omite ítems que ya tienen product_id sin buscar candidatos', async () => {
    const { service, products, items } = build({
      group: group(),
      items: [item({ id: 'i1', productId: 'already-set' })],
    });

    const result = await service.normalizeGroup(input);

    expect(products.findCandidates).not.toHaveBeenCalled();
    expect(items.setProduct).not.toHaveBeenCalled();
    expect(result).toEqual({
      outcome: 'normalized',
      merchant: 'none',
      items: { matched: 0, created: 0, llmDecided: 0 },
    });
  });

  it('omite un ítem cuyo texto canónico queda vacío sin buscar candidatos ni crear', async () => {
    const { service, products, items } = build({
      group: group(),
      items: [item({ id: 'i1', descriptionRaw: '   ' })],
    });

    const result = await service.normalizeGroup(input);

    expect(products.findCandidates).not.toHaveBeenCalled();
    expect(products.create).not.toHaveBeenCalled();
    expect(items.setProduct).not.toHaveBeenCalled();
    expect(result).toEqual({
      outcome: 'normalized',
      merchant: 'none',
      items: { matched: 0, created: 0, llmDecided: 0 },
    });
  });

  it('omite grupos en extracting como not_extracted y de otra pareja como not_found', async () => {
    await expect(
      build({ group: group({ status: 'extracting' }) }).service.normalizeGroup(
        input,
      ),
    ).resolves.toEqual({ outcome: 'skipped', reason: 'not_extracted' });

    await expect(
      build({
        group: group({ coupleId: 'other' }),
      }).service.normalizeGroup(input),
    ).resolves.toEqual({ outcome: 'skipped', reason: 'not_found' });
  });

  it('degrada creando productos y merchant nuevos cuando el proveedor falla, sin lanzar', async () => {
    const {
      service,
      items,
      products,
      merchants,
      groups,
      provider,
      extractions,
    } = build({
      group: group({ merchantRaw: 'Jumbo Nueva Providencia' }),
      items: [
        item({ id: 'i1', descriptionRaw: 'Leche Full 1L' }),
        item({ id: 'i2', descriptionRaw: 'Yogur Sabor Frutilla' }),
      ],
      merchantCandidates: [
        { id: 'm9', canonicalName: 'JUMBO PROVIDENCIA', score: 0.45 },
      ],
      productCandidatesByText: {
        'LECHE FULL 1L': [{ id: 'p1', canonicalName: 'LECHE', score: 0.9 }],
        'YOGUR SABOR FRUTILLA': [
          { id: 'p9', canonicalName: 'YOGUR FRUTILLA', score: 0.45 },
        ],
      },
      providerError: new Error('llm_timeout'),
    });

    const result = await service.normalizeGroup(input);

    expect(provider.chooseCandidates).toHaveBeenCalledTimes(1);
    expect(items.setProduct).toHaveBeenCalledWith('i1', 'p1');
    expect(products.create).toHaveBeenCalledWith(
      'c1',
      'YOGUR SABOR FRUTILLA',
      'lacteos_huevos',
    );
    expect(items.setProduct).toHaveBeenCalledWith(
      'i2',
      'product-YOGUR SABOR FRUTILLA',
    );
    expect(merchants.create).toHaveBeenCalledWith(
      'c1',
      'JUMBO NUEVA PROVIDENCIA',
      null,
    );
    expect(groups.setMerchant).toHaveBeenCalledWith(
      'g1',
      'merchant-JUMBO NUEVA PROVIDENCIA',
    );
    expect(extractions.create).toHaveBeenCalledWith(
      expect.objectContaining({
        groupId: 'g1',
        coupleId: 'c1',
        promptVersion: 'norm-v1',
        status: 'failed',
        error: 'llm_timeout',
      }),
    );
    expect(result).toEqual({
      outcome: 'normalized',
      merchant: 'created',
      items: { matched: 1, created: 1, llmDecided: 1 },
    });
  });
});
