import {
  ExtractionOutputInvalidError,
  parseExtractionOutput,
} from './extraction-output.schema.js';

const validOutput = {
  merchant_raw: 'JUMBO',
  merchant_rut: '76.123.456-7',
  receipt_date: '2026-09-01',
  total: 3480,
  currency: 'CLP',
  source_kind: 'printed',
  items: [
    {
      description_raw: 'LECHE 1L',
      qty: 1,
      unit_price: 1290,
      amount: 1290,
      category: 'lacteos_huevos',
      confidence: 0.95,
    },
    {
      description_raw: 'PAN MOLDE',
      qty: null,
      unit_price: null,
      amount: 2190,
      category: 'panaderia',
      confidence: 0.9,
    },
  ],
  confidence: 0.93,
  warnings: [],
};

describe('parseExtractionOutput', () => {
  it('acepta una salida válida', () => {
    const parsed = parseExtractionOutput(JSON.stringify(validOutput));
    expect(parsed.total).toBe(3480);
    expect(parsed.items).toHaveLength(2);
    expect(parsed.items[1]?.qty).toBeNull();
  });

  it('convierte una categoría fuera de la taxonomía en otros', () => {
    const raw = JSON.stringify({
      ...validOutput,
      items: [{ ...validOutput.items[0], category: 'electronica' }],
    });
    expect(parseExtractionOutput(raw).items[0]?.category).toBe('otros');
  });

  it('acepta fecha y total nulos', () => {
    const parsed = parseExtractionOutput(
      JSON.stringify({ ...validOutput, receipt_date: null, total: null }),
    );
    expect(parsed.receipt_date).toBeNull();
    expect(parsed.total).toBeNull();
  });

  it('rechaza una fecha con formato inválido', () => {
    expect(() =>
      parseExtractionOutput(
        JSON.stringify({ ...validOutput, receipt_date: '01/09/2026' }),
      ),
    ).toThrow(ExtractionOutputInvalidError);
  });

  it('rechaza una confianza fuera de rango', () => {
    expect(() =>
      parseExtractionOutput(
        JSON.stringify({ ...validOutput, confidence: 1.5 }),
      ),
    ).toThrow(ExtractionOutputInvalidError);
  });

  it('rechaza texto que no es JSON', () => {
    expect(() => parseExtractionOutput('no json')).toThrow(
      ExtractionOutputInvalidError,
    );
  });

  it('rechaza una fecha imposible', () => {
    expect(() =>
      parseExtractionOutput(
        JSON.stringify({ ...validOutput, receipt_date: '2026-02-30' }),
      ),
    ).toThrow(ExtractionOutputInvalidError);
  });
});
