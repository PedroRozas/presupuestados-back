import { decideCloseAction } from './close-group-decision.js';

describe('decideCloseAction', () => {
  const now = new Date('2026-09-04T12:00:00.000Z');
  const secondsBefore = (seconds: number) =>
    new Date(now.getTime() - seconds * 1000);
  const base = {
    status: 'collecting' as const,
    imageCount: 2,
    now,
    windowSeconds: 90,
  };

  it('omite si el grupo ya no está en collecting', () => {
    expect(
      decideCloseAction({
        ...base,
        status: 'needs_review',
        lastImageAt: secondsBefore(200),
        trigger: { kind: 'window', pageIndex: 2 },
      }),
    ).toEqual({ action: 'skip', reason: 'not_collecting' });
  });

  it('omite un job de ventana superado por una imagen posterior', () => {
    expect(
      decideCloseAction({
        ...base,
        lastImageAt: secondsBefore(200),
        trigger: { kind: 'window', pageIndex: 1 },
      }),
    ).toEqual({ action: 'skip', reason: 'superseded' });
  });

  it('reprograma si la ventana aún no expiró', () => {
    expect(
      decideCloseAction({
        ...base,
        lastImageAt: secondsBefore(30),
        trigger: { kind: 'window', pageIndex: 2 },
      }),
    ).toEqual({ action: 'reschedule', delayMs: 60 * 1000 });
  });

  it('cierra cuando la ventana expiró', () => {
    expect(
      decideCloseAction({
        ...base,
        lastImageAt: secondsBefore(90),
        trigger: { kind: 'window', pageIndex: 2 },
      }),
    ).toEqual({ action: 'close' });
  });

  it('cierra de inmediato por comando aunque la ventana siga abierta', () => {
    expect(
      decideCloseAction({
        ...base,
        lastImageAt: secondsBefore(5),
        trigger: { kind: 'command' },
      }),
    ).toEqual({ action: 'close' });
  });

  it('cierra si el grupo no tiene last_image_at (dato inconsistente)', () => {
    expect(
      decideCloseAction({
        ...base,
        lastImageAt: null,
        trigger: { kind: 'window', pageIndex: 2 },
      }),
    ).toEqual({ action: 'close' });
  });
});
