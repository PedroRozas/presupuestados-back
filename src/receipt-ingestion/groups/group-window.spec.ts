import { isWithinGroupWindow } from './group-window.js';

describe('isWithinGroupWindow', () => {
  const base = new Date('2026-09-03T12:00:00.000Z');
  const secondsAfter = (seconds: number) =>
    new Date(base.getTime() + seconds * 1000);

  it('es verdadero cuando la nueva imagen llega dentro de la ventana', () => {
    expect(
      isWithinGroupWindow({
        lastImageAt: base,
        receivedAt: secondsAfter(89),
        windowSeconds: 90,
      }),
    ).toBe(true);
  });

  it('es verdadero exactamente en el límite', () => {
    expect(
      isWithinGroupWindow({
        lastImageAt: base,
        receivedAt: secondsAfter(90),
        windowSeconds: 90,
      }),
    ).toBe(true);
  });

  it('es falso cuando la ventana ya expiró', () => {
    expect(
      isWithinGroupWindow({
        lastImageAt: base,
        receivedAt: secondsAfter(91),
        windowSeconds: 90,
      }),
    ).toBe(false);
  });

  it('es falso si el grupo nunca recibió imagen', () => {
    expect(
      isWithinGroupWindow({
        lastImageAt: null,
        receivedAt: base,
        windowSeconds: 90,
      }),
    ).toBe(false);
  });

  it('tolera una imagen con timestamp anterior al último (reenvío desordenado)', () => {
    expect(
      isWithinGroupWindow({
        lastImageAt: base,
        receivedAt: secondsAfter(-5),
        windowSeconds: 90,
      }),
    ).toBe(true);
  });

  it('es falso si la imagen es mucho más antigua que la última recibida', () => {
    expect(
      isWithinGroupWindow({
        lastImageAt: base,
        receivedAt: secondsAfter(-3600),
        windowSeconds: 90,
      }),
    ).toBe(false);
  });
});
