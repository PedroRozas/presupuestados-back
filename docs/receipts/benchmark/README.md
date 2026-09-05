# Benchmark de extracción

1. Copiar al menos 20 fotos reales de boletas en `docs/receipts/benchmark/images/` (gitignored). Una boleta de varias páginas son varias fotos.
2. Copiar `ground-truth.example.json` a `ground-truth.json` (gitignored) y transcribir a mano, por boleta: `receipt_date` (`YYYY-MM-DD` o `null`), `total` (entero en pesos o `null`) e `item_amounts` (montos de línea tal como aparecen, incluidos descuentos negativos).
3. `OPENAI_API_KEY` en `.env`. Ejecutar `npm run receipts:benchmark -- <modelo1>,<modelo2>` con dos o más modelos.
4. La tabla queda en `docs/receipts/benchmark.md`. Elegir el modelo y fijar `RECEIPT_EXTRACTION_MODEL` en producción.

Métricas: exactitud de `total`, exactitud de `receipt_date`, recall de montos de ítems (multiset), tokens y latencia promedio, y la columna `Fallos` con la cantidad de boletas donde la llamada al modelo o el parseo de su salida falló (no cuentan para el resto de las métricas).

La salida cruda de cada boleta se vuelca en `docs/receipts/benchmark/outputs/<modelo>/<id de boleta>.txt` (gitignored), útil para inspeccionar fallos de parseo o comparar salidas entre modelos.
