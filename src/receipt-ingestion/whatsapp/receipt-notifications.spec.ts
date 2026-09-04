import {
  buildGroupClosedMessage,
  buildNoOpenGroupMessage,
} from './receipt-notifications.js';

describe('receipt notifications', () => {
  it('resume una boleta de una página en singular', () => {
    expect(buildGroupClosedMessage({ pageCount: 1 })).toBe(
      'Recibí tu boleta (1 foto). Quedó guardada y pendiente de revisión.',
    );
  });

  it('resume una boleta de varias páginas en plural', () => {
    expect(buildGroupClosedMessage({ pageCount: 3 })).toBe(
      'Recibí tu boleta (3 fotos). Quedó guardada y pendiente de revisión.',
    );
  });

  it('avisa cuando no hay boleta abierta', () => {
    expect(buildNoOpenGroupMessage()).toBe(
      'No tengo ninguna boleta abierta. Envíame la foto primero.',
    );
  });
});
