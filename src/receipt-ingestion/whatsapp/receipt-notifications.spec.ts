import {
  buildExtractionFailedMessage,
  buildExtractionReadyMessage,
  buildExtractionReviewMessage,
  buildMonthlyCapMessage,
  buildNoOpenGroupMessage,
  formatClp,
  formatReceiptDate,
} from './receipt-notifications.js';

describe('receipt notifications', () => {
  it('avisa cuando no hay boleta abierta', () => {
    expect(buildNoOpenGroupMessage()).toBe(
      'No tengo ninguna boleta abierta. Envíame la foto primero.',
    );
  });

  it('formatea pesos chilenos y fechas', () => {
    expect(formatClp(3480)).toBe('$3.480');
    expect(formatReceiptDate('2026-09-01')).toBe('01-09-2026');
  });

  it('resume una boleta lista', () => {
    expect(
      buildExtractionReadyMessage({
        merchantRaw: 'JUMBO',
        receiptDate: '2026-09-01',
        total: 3480,
        itemCount: 2,
      }),
    ).toBe('Boleta lista: JUMBO, 01-09-2026, total $3.480, 2 ítems.');
  });

  it('resume una boleta que necesita revisión con sus motivos', () => {
    expect(
      buildExtractionReviewMessage(
        { merchantRaw: null, receiptDate: null, total: null, itemCount: 1 },
        ['total_mismatch', 'missing_date'],
      ),
    ).toBe(
      'Boleta guardada, necesita revisión (el total no cuadra, sin fecha): comercio desconocido, sin fecha, total desconocido, 1 ítem.',
    );
  });

  it('avisa fallo y tope mensual', () => {
    expect(buildExtractionFailedMessage()).toBe(
      'No pude leer la boleta después de varios intentos. Quedó guardada para revisión manual.',
    );
    expect(buildMonthlyCapMessage()).toBe(
      'Se alcanzó el tope mensual de lecturas de boletas. La foto quedó guardada.',
    );
  });
});
