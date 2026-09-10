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
      'Todavía no hay una boleta pendiente de cerrar. Envíame una foto y te ayudo a registrarla.',
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
    ).toBe('¡Lista tu boleta! JUMBO, 01-09-2026, total $3.480, 2 ítems.');
  });

  it('resume una boleta que necesita revisión con sus motivos', () => {
    expect(
      buildExtractionReviewMessage(
        { merchantRaw: null, receiptDate: null, total: null, itemCount: 1 },
        ['total_mismatch', 'missing_date'],
      ),
    ).toBe(
      'Ya guardé tu boleta. Hay algunos datos por revisar (el total no cuadra, sin fecha): comercio desconocido, sin fecha, total desconocido, 1 ítem.',
    );
  });

  it('avisa fallo y tope mensual', () => {
    expect(buildExtractionFailedMessage()).toBe(
      'Lo siento, no logré leer la boleta después de varios intentos. La dejé guardada para revisión manual.',
    );
    expect(buildMonthlyCapMessage()).toBe(
      'Llegamos al tope mensual de lecturas de boletas. Tu foto quedó guardada para que puedas revisarla.',
    );
  });
});
