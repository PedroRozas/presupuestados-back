import { NormalizeGroupProcessor } from './normalize-group.processor.js';
import type { NormalizationService } from '../../normalization/normalization.service.js';

const payload = { groupId: 'g1', coupleId: 'c1' };

const build = (outcome: unknown) => {
  const normalization = {
    normalizeGroup: jest.fn(() => Promise.resolve(outcome)),
  };
  const processor = new NormalizeGroupProcessor(
    normalization as unknown as NormalizationService,
  );
  return { processor, normalization };
};

describe('NormalizeGroupProcessor', () => {
  it('delega en NormalizationService.normalizeGroup y devuelve su resultado', async () => {
    const outcome = {
      outcome: 'normalized',
      merchant: 'matched',
      items: { matched: 2, created: 1, llmDecided: 0 },
    };
    const { processor, normalization } = build(outcome);

    const result = await processor.process(payload);

    expect(normalization.normalizeGroup).toHaveBeenCalledWith({
      groupId: 'g1',
      coupleId: 'c1',
    });
    expect(result).toBe(outcome);
  });

  it('devuelve el resultado cuando la normalización se omite', async () => {
    const outcome = { outcome: 'skipped', reason: 'not_found' };
    const { processor, normalization } = build(outcome);

    const result = await processor.process(payload);

    expect(normalization.normalizeGroup).toHaveBeenCalledWith(payload);
    expect(result).toBe(outcome);
  });
});
