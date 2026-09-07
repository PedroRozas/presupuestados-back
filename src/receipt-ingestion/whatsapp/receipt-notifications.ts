import type { ExtractionSummary } from '../extraction/extraction.service.js';
import type { ReceiptReviewReason } from '../receipt.constants.js';

const SINGLE = 1;
const CLP_FORMATTER = new Intl.NumberFormat('es-CL', {
  style: 'currency',
  currency: 'CLP',
  maximumFractionDigits: 0,
});

export const REVIEW_REASON_LABELS: Record<ReceiptReviewReason, string> = {
  total_mismatch: 'el total no cuadra',
  low_confidence: 'lectura poco confiable',
  handwritten: 'boleta manuscrita',
  missing_date: 'sin fecha',
  extraction_failed: 'no se pudo leer',
  monthly_cap: 'tope mensual alcanzado',
};

export const formatClp = (amount: number): string =>
  CLP_FORMATTER.format(amount).replace(/\s/g, '');

export const formatReceiptDate = (isoDate: string): string => {
  const [year, month, day] = isoDate.split('-');
  return `${day}-${month}-${year}`;
};

const itemsLabel = (count: number): string =>
  `${count} ${count === SINGLE ? 'ítem' : 'ítems'}`;

const summaryLine = (summary: ExtractionSummary): string => {
  const merchant = summary.merchantRaw ?? 'comercio desconocido';
  const date = summary.receiptDate
    ? formatReceiptDate(summary.receiptDate)
    : 'sin fecha';
  const total =
    summary.total === null
      ? 'total desconocido'
      : `total ${formatClp(summary.total)}`;
  return `${merchant}, ${date}, ${total}, ${itemsLabel(summary.itemCount)}`;
};

export const buildExtractionReadyMessage = (
  summary: ExtractionSummary,
): string => `Boleta lista: ${summaryLine(summary)}.`;

export const buildExtractionReviewMessage = (
  summary: ExtractionSummary,
  reasons: ReceiptReviewReason[],
): string =>
  `Boleta guardada, necesita revisión (${reasons.map((reason) => REVIEW_REASON_LABELS[reason]).join(', ')}): ${summaryLine(summary)}.`;

export const buildExtractionFailedMessage = (): string =>
  'No pude leer la boleta después de varios intentos. Quedó guardada para revisión manual.';

export const buildMonthlyCapMessage = (): string =>
  'Se alcanzó el tope mensual de lecturas de boletas. La foto quedó guardada.';

export const buildNoOpenGroupMessage = (): string =>
  'No tengo ninguna boleta abierta. Envíame la foto primero.';
