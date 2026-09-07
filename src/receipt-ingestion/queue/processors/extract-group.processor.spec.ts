import { ExtractGroupProcessor } from './extract-group.processor.js';
import type { ExtractionService } from '../../extraction/extraction.service.js';
import type { ReceiptQueueService } from '../receipt-queue.service.js';
import type { ReceiptGroupsRepository } from '../../repository/receipt-groups.repository.js';

const payload = {
  groupId: 'g1',
  coupleId: 'c1',
  senderPhoneE164: '+56912345678',
};
const summary = {
  merchantRaw: 'JUMBO',
  receiptDate: '2026-09-01',
  total: 3480,
  itemCount: 2,
};

const build = (outcome: unknown, markFailedResult = true) => {
  const extraction = { extractGroup: jest.fn(() => Promise.resolve(outcome)) };
  const queue = {
    enqueueNotifyUser: jest.fn(() => Promise.resolve()),
    enqueueNormalizeGroup: jest.fn(() => Promise.resolve()),
  };
  const groups = {
    markFailed: jest.fn(() => Promise.resolve(markFailedResult)),
  };
  const processor = new ExtractGroupProcessor(
    extraction as unknown as ExtractionService,
    queue as unknown as ReceiptQueueService,
    groups as unknown as ReceiptGroupsRepository,
  );
  return { processor, extraction, queue, groups };
};

describe('ExtractGroupProcessor', () => {
  it('avisa "boleta lista" y encola normalize-group cuando la extracción queda ready', async () => {
    const { processor, extraction, queue } = build({
      outcome: 'extracted',
      status: 'ready',
      reasons: [],
      summary,
    });
    await processor.process(payload, 1);
    expect(extraction.extractGroup).toHaveBeenCalledWith({
      groupId: 'g1',
      coupleId: 'c1',
      attempt: 1,
    });
    expect(queue.enqueueNotifyUser).toHaveBeenCalledWith({
      toPhoneE164: '+56912345678',
      body: 'Boleta lista: JUMBO, 01-09-2026, total $3.480, 2 ítems.',
    });
    expect(queue.enqueueNormalizeGroup).toHaveBeenCalledWith({
      groupId: 'g1',
      coupleId: 'c1',
    });
  });

  it('avisa revisión con motivos y encola normalize-group cuando queda needs_review', async () => {
    const { processor, queue } = build({
      outcome: 'extracted',
      status: 'needs_review',
      reasons: ['handwritten'],
      summary,
    });
    await processor.process(payload, 2);
    expect(queue.enqueueNotifyUser).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.stringContaining(
          'necesita revisión (boleta manuscrita)',
        ) as string,
      }),
    );
    expect(queue.enqueueNormalizeGroup).toHaveBeenCalledWith({
      groupId: 'g1',
      coupleId: 'c1',
    });
  });

  it('avisa el tope mensual sin encolar normalize-group', async () => {
    const { processor, queue } = build({ outcome: 'monthly_cap' });
    await processor.process(payload, 1);
    expect(queue.enqueueNotifyUser).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.stringContaining('tope mensual') as string,
      }),
    );
    expect(queue.enqueueNormalizeGroup).not.toHaveBeenCalled();
  });

  it('no avisa ni encola normalize-group cuando la extracción se omite por not_extracting o not_found', async () => {
    const { processor, queue } = build({
      outcome: 'skipped',
      reason: 'not_extracting',
    });
    await processor.process(payload, 1);
    expect(queue.enqueueNotifyUser).not.toHaveBeenCalled();
    expect(queue.enqueueNormalizeGroup).not.toHaveBeenCalled();

    const notFound = build({ outcome: 'skipped', reason: 'not_found' });
    await notFound.processor.process(payload, 1);
    expect(notFound.queue.enqueueNotifyUser).not.toHaveBeenCalled();
    expect(notFound.queue.enqueueNormalizeGroup).not.toHaveBeenCalled();
  });

  it('avisa con el mensaje de fallo y no encola normalize-group cuando el grupo no tiene imágenes', async () => {
    const { processor, queue } = build({
      outcome: 'skipped',
      reason: 'no_images',
    });
    await processor.process(payload, 1);
    expect(queue.enqueueNotifyUser).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.stringContaining('No pude leer la boleta') as string,
      }),
    );
    expect(queue.enqueueNormalizeGroup).not.toHaveBeenCalled();
  });

  it('al agotar reintentos marca failed y avisa cuando markFailed devuelve true', async () => {
    const { processor, groups, queue } = build({}, true);
    await processor.onExhausted(payload);
    expect(groups.markFailed).toHaveBeenCalledWith('g1', ['extraction_failed']);
    expect(queue.enqueueNotifyUser).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.stringContaining('No pude leer la boleta') as string,
      }),
    );
  });

  it('al agotar reintentos no avisa cuando markFailed devuelve false', async () => {
    const { processor, queue } = build({}, false);
    await processor.onExhausted(payload);
    expect(queue.enqueueNotifyUser).not.toHaveBeenCalled();
  });
});
