import { Client } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from '../../database/schema/index.js';
import { ReceiptQueryRepository } from './receipt-query.repository.js';
import { ReceiptQueryTools } from '../query/receipt-query-tools.js';

// Opt-in PostgreSQL integration test. All fixtures use session-local TEMP tables.
const databaseUrl = process.env.RECEIPT_QUERY_TEST_DATABASE_URL;
const describePostgres = databaseUrl ? describe : describe.skip;
const coupleId = '11111111-1111-4111-8111-111111111111';
const otherCoupleId = '22222222-2222-4222-8222-222222222222';
const receiptId = '33333333-3333-4333-8333-333333333333';

describePostgres('receipt queries against PostgreSQL', () => {
  let client: Client;
  let repository: ReceiptQueryRepository;
  let tools: ReceiptQueryTools;

  beforeAll(async () => {
    client = new Client({ connectionString: databaseUrl });
    await client.connect();
    await client.query(`
      create temp table receipt_groups (
        id uuid primary key, couple_id uuid, merchant_id uuid, merchant_raw text,
        receipt_date date, total_declared numeric, status text,
        review_reasons text[] default '{}', created_at timestamptz default now()
      );
      create temp table receipt_merchants (id uuid primary key, couple_id uuid, canonical_name text, aliases text[]);
      create temp table receipt_products (id uuid primary key, couple_id uuid, canonical_name text);
      create temp table receipt_items (
        id uuid default gen_random_uuid(), group_id uuid, couple_id uuid,
        product_id uuid, description_raw text, qty numeric, unit_price numeric,
        amount numeric, position integer
      );
    `);
    repository = new ReceiptQueryRepository(drizzle(client, { schema }));
    tools = new ReceiptQueryTools(repository);
  });

  beforeEach(async () => {
    await client.query(
      'truncate pg_temp.receipt_items, pg_temp.receipt_groups, pg_temp.receipt_merchants, pg_temp.receipt_products',
    );
    await client.query(
      `insert into receipt_groups (id, couple_id, merchant_raw, receipt_date, total_declared, status) values ($1, $2, 'LIDER', '2026-09-09', 83665, 'ready')`,
      [receiptId, coupleId],
    );
    await client.query(
      `insert into receipt_items (group_id, couple_id, description_raw, qty, unit_price, amount, position)
      select $1, $2, 'Producto ' || n, 1, case when n = 30 then 25665 else 2000 end,
        case when n = 30 then 25665 else 2000 end, n from generate_series(1, 30) n`,
      [receiptId, coupleId],
    );
  });

  afterAll(async () => {
    await client?.end();
  });

  const execute = (name: string, args: unknown, household = coupleId) =>
    tools.execute(household, {
      callId: 'test',
      name,
      argumentsJson: JSON.stringify(args),
    });

  it.each(['lider', 'LIDER', 'Lider', 'Líder', 'LÍDER', 'Li\u0301der'])(
    'encuentra la boleta por %s aunque ningún producto se llame así',
    async (text) => {
      expect(await repository.searchItems(coupleId, text, 2026, 9, 20)).toEqual(
        [],
      );
      expect(
        await execute('search_receipts', { text, year: 2026, month: 9 }),
      ).toEqual({
        receipts: [
          {
            id: receiptId,
            merchant: 'LIDER',
            date: '2026-09-09',
            total: 83665,
            status: 'ready',
            itemCount: 30,
            reviewReasons: [],
          },
        ],
        hasMore: false,
        nextOffset: null,
      });
    },
  );

  it('entrega 30 ítems ordenados y conserva el monto total de la boleta', async () => {
    const result = (await execute('get_receipt_detail', { receiptId })) as {
      receipt: {
        total: number;
        items: { description: string; amount: number }[];
      };
    };
    expect(result.receipt.total).toBe(83665);
    expect(result.receipt.items).toHaveLength(30);
    expect(result.receipt.items[0].description).toBe('Producto 1');
    expect(result.receipt.items[29]).toMatchObject({
      description: 'Producto 30',
      amount: 25665,
    });
    expect(
      result.receipt.items.reduce((sum, item) => sum + item.amount, 0),
    ).toBe(83665);
  });

  it('busca nombre original, canónico y alias aunque sean distintos', async () => {
    await client.query(
      `insert into receipt_merchants values ($1, $2, 'LÍDER', array['Hipermercado Económico'])`,
      [receiptId, coupleId],
    );
    await client.query(
      `update receipt_groups set merchant_id = $1, merchant_raw = 'Walmart Chile'`,
      [receiptId],
    );
    for (const text of ['lider', 'walmart', 'economico']) {
      expect(
        await repository.searchReceipts(coupleId, text, 2026, 9, 11),
      ).toHaveLength(1);
    }
  });

  it('preserva nulos, descuentos y nombres canónicos al devolver el detalle', async () => {
    await client.query('update receipt_groups set total_declared = null');
    await client.query(
      `insert into receipt_products values ($1, $2, 'Leche entera 1L')`,
      [receiptId, coupleId],
    );
    await client.query(
      `update receipt_items set product_id = $1, qty = null, unit_price = null where position = 1`,
      [receiptId],
    );
    await client.query(
      `update receipt_items set amount = -100 where position = 30`,
    );
    const result = (await execute('get_receipt_detail', { receiptId })) as {
      receipt: { total: number | null; items: unknown[] };
    };
    expect(result.receipt.total).toBeNull();
    expect(result.receipt.items[0]).toEqual({
      description: 'Leche entera 1L',
      quantity: null,
      unitPrice: null,
      amount: 2000,
    });
    expect(result.receipt.items[29]).toMatchObject({ amount: -100 });
  });

  it('distingue una boleta sin ítems de una boleta inexistente', async () => {
    await client.query('truncate pg_temp.receipt_items');
    expect(await execute('get_receipt_detail', { receiptId })).toMatchObject({
      receipt: { itemCount: 0, items: [] },
    });
    expect(
      await execute('get_receipt_detail', { receiptId: otherCoupleId }),
    ).toEqual({ receipt: null });
  });

  it('mantiene mes y hogar aislados incluso al pedir un ID conocido', async () => {
    expect(
      await repository.searchReceipts(coupleId, 'Lider', 2026, 8, 11),
    ).toEqual([]);
    expect(
      await repository.searchReceipts(otherCoupleId, 'Lider', 2026, 9, 11),
    ).toEqual([]);
    expect(
      await execute('get_receipt_detail', { receiptId }, otherCoupleId),
    ).toEqual({ receipt: null });
  });

  it('incluye pendientes de revisión y excluye descartadas o incompletas', async () => {
    await client.query(
      `update receipt_groups set status = 'needs_review', review_reasons = array['total_mismatch']`,
    );
    expect(
      await repository.searchReceipts(coupleId, 'lider', 2026, 9, 11),
    ).toMatchObject([
      { status: 'needs_review', reviewReasons: ['total_mismatch'] },
    ]);
    expect(await repository.receiptDetail(coupleId, receiptId)).toMatchObject({
      status: 'needs_review',
    });
    for (const status of [
      'discarded',
      'failed',
      'collecting',
      'extracting',
      'closed',
    ]) {
      await client.query('update receipt_groups set status = $1', [status]);
      expect(
        await repository.searchReceipts(coupleId, 'lider', 2026, 9, 11),
      ).toEqual([]);
      expect(await repository.receiptDetail(coupleId, receiptId)).toBeNull();
    }
  });

  it.each(['Li%', 'Li_', "Lider' OR 1=1 --", 'Li\\'])(
    'trata %s como texto literal',
    async (text) => {
      expect(
        await repository.searchReceipts(coupleId, text, 2026, 9, 11),
      ).toEqual([]);
    },
  );

  it('advierte si hay más coincidencias y ordena las compras más recientes primero', async () => {
    await client.query(
      `insert into receipt_groups (id, couple_id, merchant_raw, receipt_date, total_declared, status)
      select gen_random_uuid(), $1, 'LIDER', '2026-09-10'::date + n, 1000, 'ready' from generate_series(0, 10) n`,
      [coupleId],
    );
    const result = (await execute('search_receipts', {
      text: 'lider',
      year: 2026,
      month: 9,
    })) as { receipts: { date: string }[]; hasMore: boolean };
    expect(result.hasMore).toBe(true);
    expect(result.receipts).toHaveLength(10);
    expect(result.receipts[0].date).toBe('2026-09-20');
    expect(result).toMatchObject({ nextOffset: 10 });
    const next = (await execute('search_receipts', {
      text: 'lider',
      year: 2026,
      month: 9,
      offset: 10,
    })) as { receipts: { id: string }[] };
    expect(next).toMatchObject({ hasMore: false, nextOffset: null });
    expect(next.receipts).toHaveLength(2);
    expect(next.receipts[1].id).toBe(receiptId);
  });
});
