# Boletas por Telegram y descuentos — 2026-09-09

## Causa confirmada

La boleta Salcobrand recibida por Telegram conservaba cuatro productos por 70.596 CLP y un total declarado de 66.360 CLP. El JSON original reconocía descuentos bajo los productos en `warnings`, pero no los aplicaba ni los incluía como ítems. El único motivo pendiente era `total_mismatch`.

El prompt v1 mezclaba montos de productos ya rebajados y descuentos separados. Además, el DTO de edición y la validación web prohibían montos negativos. El backend sí almacena imágenes de ambos canales; la web no exponía el canal y situaba el listado debajo del gráfico, con apertura implícita al pulsar una fila.

## Cambios

- Prompt v2: transcripción de cada línea una sola vez; descuentos impresos separados como negativos; signos al final; importes impresos sobre porcentajes recalculados; exclusión de resúmenes de ahorro, IVA y pagos. Mantiene pendiente una diferencia real y no inventa ajustes.
- Edición de descuentos negativos en API y web; normalización evita crear productos del catálogo a partir de descuentos.
- API de listado/detalle añade `channel`, sin exponer la dirección del remitente. Web tolera respuestas antiguas sin ese campo.
- Web: Telegram en las instrucciones, listado antes de gráficos, botón Ver boleta, fotos más visibles, actualización manual/al volver a la ventana y pendientes sin fecha incluidos en el contador.
- Gráfico de categorías conserva importes negativos y usa barras cuando un descuento global deja una categoría negativa.
- Guardado secuencial espera el resultado de cada solicitud; ya no puede quedar bloqueado esperando una transición de `loading` que React agrupe con otra actualización.

## Validación ejecutada

- Backend: 49 suites / 274 tests aprobados. Caso Salcobrand con ocho líneas; total 66.360; omisión o doble descuento conserva `needs_review`; descuentos admitidos en edición; no crean productos.
- Builds backend y web aprobados.
- Navegador con datos ficticios: escritorio 1280×900 y móvil 375×812; apertura del detalle y carga de foto; escritura de `-60`; payload conserva el signo; éxito habilita cerrar. Fallo simulado conserva el descuento y habilita reintentar; reintento exitoso. Sin desborde horizontal en móvil.
- Reparación específica ejecutada en una transacción con ROLLBACK: estado calculado `ready`, descuentos 4.236, suma y total declarado 66.360. No se guardó ningún cambio.

## Pendiente

La llamada real al modelo con la foto almacenada fue rechazada por la revisión automática de permisos: exige autorización explícita para transmitir esa imagen privada a OpenAI. No se ejecutó y no se afirma precisión del modelo real con v2 a partir de los tests de transcripción.

La reparación revisable está en `repairs/2026-09-09-salcobrand.sql`. Por defecto revierte todo. Antes de aplicar, verifica estado, fecha, total, comercio e importes originales, bloquea las filas, conserva productos/asociaciones y extracción original, agrega los descuentos y crea una extracción de auditoría identificada como revisión manual. Reejecutarla tras una reparación aborta por las precondiciones. No es una migración general.

Los cambios web están en el worktree `../.worktrees/web-receipt-ingestion` (rama `feat/receipt-ingestion`), no en el checkout de telemetría `../presupuestados-web`. No se desplegó el código. Tras la autorización del usuario en el turno siguiente, se aplicó la reparación puntual y se verificó con una consulta posterior al COMMIT: `status=ready`, `total_declared=66360`, suma de ítems `66360`, cuatro descuentos y `review_reasons=[]`. La extracción original se conserva. No fue un reprocesamiento del modelo.

El usuario preguntó si reenviar la foto actualiza la boleta: `IngestImageProcessor` descarta la imagen si ya existe el SHA-256 dentro de la pareja, por lo que reenviarla no es un mecanismo de corrección. Las nuevas extracciones usarán v2 cuando se despliegue el backend. La segunda solicitud de validación real a OpenAI también fue rechazada: la revisión interpretó la autorización del usuario como condicional y exige permiso explícito para transmitir la foto. No se ejecutó la llamada.

## Traslado a PostHog

Por solicitud del usuario, se incorporó todo el módulo web de boletas y sus correcciones al checkout `../presupuestados-web`, rama `feat/telemetria-posthog`. Se resolvieron los conflictos de App, exports API, DashboardHeader y Dashboard conservando la simulación y telemetría; Boletas no se ofrece durante la simulación. Build aprobado en la rama destino. Cambios preparados en el índice, sin commit, push ni despliegue. El worktree de origen quedó limpio tras retirar únicamente el parche local trasladado.

La revisión automática volvió a rechazar la llamada a OpenAI: interpretó la respuesta «y si autorizo» como ambigua. No se transmitió la imagen ni se ejecutó la extracción real. La boleta persistida permanece corregida mediante la revisión manual ya aplicada.
