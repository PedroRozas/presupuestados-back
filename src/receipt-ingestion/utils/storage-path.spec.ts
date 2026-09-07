import { buildStoragePath } from './storage-path.js';

describe('buildStoragePath', () => {
  it('arma couple/YYYY/MM/group/page.webp con mes de dos dígitos en UTC', () => {
    const path = buildStoragePath({
      coupleId: 'couple-1',
      groupId: 'group-1',
      receivedAt: new Date('2026-03-05T23:30:00.000Z'),
      pageIndex: 1,
    });

    expect(path).toBe('couple-1/2026/03/group-1/1.webp');
  });

  it('usa el índice de página tal cual', () => {
    const path = buildStoragePath({
      coupleId: 'c',
      groupId: 'g',
      receivedAt: new Date('2026-12-31T00:00:00.000Z'),
      pageIndex: 12,
    });

    expect(path).toBe('c/2026/12/g/12.webp');
  });
});
