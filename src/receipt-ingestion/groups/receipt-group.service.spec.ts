import { ReceiptGroupService } from './receipt-group.service.js';
import type { ReceiptGroupsRepository } from '../repository/receipt-groups.repository.js';
import type { ReceiptConfigService } from '../receipt.config.js';
import type { ReceiptGroup } from '../../database/schema/index.js';

const input = {
  senderPhoneE164: '+56912345678',
  coupleId: 'c1',
  userId: 'u1',
  receivedAt: new Date('2026-09-04T12:00:00.000Z'),
};
const existing = {
  id: 'g-existing',
  lastImageAt: input.receivedAt,
} as ReceiptGroup;
const uniqueViolation = Object.assign(new Error('duplicate key'), {
  code: '23505',
});

describe('ReceiptGroupService.resolveOpenGroup', () => {
  const build = (
    findResults: Array<ReceiptGroup | undefined>,
    createError?: Error,
  ) => {
    let call = 0;
    const groups = {
      findOpenBySender: jest.fn(() => Promise.resolve(findResults[call++])),
      create: jest.fn(() =>
        createError
          ? Promise.reject(createError)
          : Promise.resolve({ id: 'g-new' } as ReceiptGroup),
      ),
    };
    const config = { groupWindowSeconds: 90 } as ReceiptConfigService;
    return {
      service: new ReceiptGroupService(
        groups as unknown as ReceiptGroupsRepository,
        config,
      ),
      groups,
    };
  };

  it('crea un grupo cuando no hay ninguno abierto', async () => {
    const { service } = build([undefined]);
    await expect(service.resolveOpenGroup(input)).resolves.toEqual({
      id: 'g-new',
    });
  });

  it('si otro job creó el grupo primero, vuelve a buscarlo y lo reutiliza', async () => {
    const { service, groups } = build([undefined, existing], uniqueViolation);
    await expect(service.resolveOpenGroup(input)).resolves.toBe(existing);
    expect(groups.findOpenBySender).toHaveBeenCalledTimes(2);
  });

  it('propaga otros errores de creación', async () => {
    const { service } = build([undefined], new Error('db down'));
    await expect(service.resolveOpenGroup(input)).rejects.toThrow('db down');
  });
});
