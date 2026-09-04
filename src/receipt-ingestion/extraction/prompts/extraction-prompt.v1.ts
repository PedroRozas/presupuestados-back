import {
  RECEIPT_PRODUCT_CATEGORIES,
  RECEIPT_PROMPT_VERSION_V1,
  RECEIPT_SOURCE_KINDS,
} from '../../receipt.constants.js';

export interface ExtractionPrompt {
  version: string;
  schemaName: string;
  system: string;
  user: string;
  outputJsonSchema: Record<string, unknown>;
}

const nullableNumber = { type: ['number', 'null'] };
const nullableString = { type: ['string', 'null'] };

const itemJsonSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    description_raw: {
      type: 'string',
      description: 'Descripción tal como aparece impresa, sin corregir.',
    },
    qty: { ...nullableNumber, description: 'Cantidad si está impresa.' },
    unit_price: {
      ...nullableNumber,
      description: 'Precio unitario si está impreso.',
    },
    amount: {
      type: 'number',
      description: 'Monto total de la línea en pesos, entero, sin separadores.',
    },
    category: {
      type: 'string',
      enum: [...RECEIPT_PRODUCT_CATEGORIES],
      description: 'Una categoría de la lista. Si ninguna encaja, otros.',
    },
    confidence: {
      type: 'number',
      description: 'Confianza de 0 a 1 en la lectura de esta línea.',
    },
  },
  required: [
    'description_raw',
    'qty',
    'unit_price',
    'amount',
    'category',
    'confidence',
  ],
};

export const EXTRACTION_PROMPT_V1: ExtractionPrompt = {
  version: RECEIPT_PROMPT_VERSION_V1,
  schemaName: 'receipt_extraction',
  system: `Eres un extractor de boletas de supermercado y comercios chilenos.
Recibes una o varias fotos de la misma boleta, en orden. Devuelves únicamente el JSON pedido.
Lees literalmente lo impreso: no corrijas ortografía ni completes descripciones truncadas.
Los montos son pesos chilenos enteros, sin puntos ni símbolos. Descuentos y promociones aplicados a una línea van restados en amount; si aparecen como línea aparte, devuélvelos como línea con amount negativo.
No incluyas subtotales, totales, propinas, vueltos ni medios de pago como ítems.
Si la boleta está escrita a mano, source_kind es handwritten. Si es impresa, printed. Si no puedes distinguir, unknown.
Si un dato no está en la imagen, devuelve null. Nunca inventes la fecha ni el total.
confidence global es tu confianza en que items y total son correctos.`,
  user: `Extrae los datos de la boleta de las imágenes adjuntas.
Categorías permitidas para cada ítem: ${RECEIPT_PRODUCT_CATEGORIES.join(', ')}.
receipt_date en formato YYYY-MM-DD o null. total es el total pagado impreso, o null si no aparece.
warnings: anota en español cualquier problema de lectura (borroso, cortado, dudas de un monto).`,
  outputJsonSchema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      merchant_raw: {
        ...nullableString,
        description: 'Nombre del comercio tal como aparece.',
      },
      merchant_rut: {
        ...nullableString,
        description: 'RUT del comercio con formato impreso.',
      },
      receipt_date: {
        ...nullableString,
        description: 'Fecha de la boleta YYYY-MM-DD.',
      },
      total: {
        ...nullableNumber,
        description: 'Total pagado en pesos enteros.',
      },
      currency: {
        type: 'string',
        description: 'Código de moneda, normalmente CLP.',
      },
      source_kind: { type: 'string', enum: [...RECEIPT_SOURCE_KINDS] },
      items: { type: 'array', items: itemJsonSchema },
      confidence: { type: 'number' },
      warnings: { type: 'array', items: { type: 'string' } },
    },
    required: [
      'merchant_raw',
      'merchant_rut',
      'receipt_date',
      'total',
      'currency',
      'source_kind',
      'items',
      'confidence',
      'warnings',
    ],
  },
};
