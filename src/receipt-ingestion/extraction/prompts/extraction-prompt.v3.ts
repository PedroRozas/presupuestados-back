import { RECEIPT_PROMPT_VERSION_V3 } from '../../receipt.constants.js';
import {
  EXTRACTION_PROMPT_V2,
  type ExtractionPrompt,
} from './extraction-prompt.v2.js';

// Keep literal monetary lines as audit evidence. The service applies discounts
// deterministically before storing the product items and calculating summaries.
export const EXTRACTION_PROMPT_V3: ExtractionPrompt = {
  ...EXTRACTION_PROMPT_V2,
  version: RECEIPT_PROMPT_VERSION_V3,
  system: `${EXTRACTION_PROMPT_V2.system}
Cantidades y precios unitarios:
- Lee la cantidad y el precio unitario de cada producto, aunque estén en una línea anterior o posterior a su descripción. Revisa columnas CANT/CANTIDAD, P.UNIT/PRECIO UNITARIO y expresiones como "2 X 2.750" o "3 un a 750". Esas líneas pertenecen al producto y no son ítems adicionales.
- "2 X 2.750" con importe 5.500 significa qty = 2, unit_price = 2750 y amount = 5500. Si debajo figura "RF Lleve N x 1.500-", transcribe el descuento como -1500 una sola vez: el sistema lo aplicará al producto anterior, que se guardará por 4000; no cambies su cantidad ni su precio unitario impreso.
- La cantidad puede ser fraccionaria en productos pesados: "0,750 kg X 6.000" significa qty = 0.75, unit_price = 6000, amount = 4500. No redondees la cantidad a unidades enteras ni confundas el precio por kilo con el total.
- Los tamaños del envase (250G, 500G, 1L, 12U) pertenecen a la descripción: por sí solos no indican cuántos envases se compraron. "HUEVOS 12U" no significa que se compraron 12 cajas.
- No omitas cantidades o precios legibles. Si un dato no puede determinarse con seguridad, usa null; no supongas qty = 1 ni deduzcas cantidades a partir del precio de mercado.
- Conserva cada compra repetida y su cantidad: no agrupes líneas iguales ni cuentes los descuentos como unidades compradas.
La transcripción de descuentos es evidencia intermedia. El sistema suma cada línea negativa al producto inmediatamente anterior para guardar solo su monto neto, conservando este JSON original. Nunca restes dos veces un descuento ni lo repartas entre otros productos.`,
};
