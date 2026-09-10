import { AnswerQueryProcessor } from './answer-query.processor.js';
import { QUERY_UNRESOLVED_MESSAGE } from '../../query/receipt-query.service.js';
import type { ReceiptQueryService } from '../../query/receipt-query.service.js';
import type { ReceiptQueueService } from '../receipt-queue.service.js';

describe('AnswerQueryProcessor', () => {
  it('responde la consulta y encola el aviso al remitente', async () => {
    const queries = {
      answer: jest.fn(() => Promise.resolve('Gastaste $1.000')),
    };
    const queue = { enqueueNotifyUser: jest.fn(() => Promise.resolve()) };
    const processor = new AnswerQueryProcessor(
      queries as unknown as ReceiptQueryService,
      queue as unknown as ReceiptQueueService,
    );

    await processor.process({
      senderAddress: '+56912345678',
      coupleId: 'c1',
      message: '¿cuánto gasté?',
    });

    expect(queries.answer).toHaveBeenCalledWith({
      coupleId: 'c1',
      threadId: '+56912345678',
      message: '¿cuánto gasté?',
    });
    expect(queue.enqueueNotifyUser).toHaveBeenCalledWith({
      toAddress: '+56912345678',
      body: 'Gastaste $1.000',
    });
  });

  it('avisa con el texto fijo cuando el modelo falla, sin relanzar el job', async () => {
    const queries = {
      answer: jest.fn(() => Promise.reject(new Error('timeout'))),
    };
    const queue = { enqueueNotifyUser: jest.fn(() => Promise.resolve()) };
    const processor = new AnswerQueryProcessor(
      queries as unknown as ReceiptQueryService,
      queue as unknown as ReceiptQueueService,
    );

    await expect(
      processor.process({
        senderAddress: '+56912345678',
        coupleId: 'c1',
        message: 'q',
      }),
    ).resolves.toBeUndefined();
    expect(queue.enqueueNotifyUser).toHaveBeenCalledWith({
      toAddress: '+56912345678',
      body: QUERY_UNRESOLVED_MESSAGE,
    });
  });
});
