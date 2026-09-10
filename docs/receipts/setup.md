# Ingesta de boletas por WhatsApp — Setup

## 1. Bucket privado en Supabase Storage

En el SQL editor de Supabase:

```sql
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('receipts', 'receipts', false, 10485760, array['image/webp'])
on conflict (id) do nothing;
```

RLS ya está activo en `storage.objects`. No se crea ninguna política para `anon` ni `authenticated`: el único acceso es el backend con `service_role`, que ignora RLS, y las URLs firmadas que él genera. Si algún día un cliente accede con JWT de usuario, agregar una política que compare el primer segmento del path con `couple_id` del perfil.

## 2. Allowlist y feature flag

Una fila por persona autorizada. `sender_address` es la dirección del remitente: teléfono E.164 con `+` para WhatsApp (`+56957598006`) o `tg:<id>` para Telegram (`tg:123456789`). `user_id` es `profiles.id`; `couple_id` es `profiles.couple_id` de esa persona.

```sql
insert into receipt_allowed_senders (sender_address, user_id, couple_id)
select '+569XXXXXXXX', p.id, p.couple_id
from profiles p
where p.email = 'correo@ejemplo.com';
```

Deshabilitar sin borrar: `update receipt_allowed_senders set enabled = false where sender_address = '+569XXXXXXXX';`

## 3. App de Meta y WhatsApp Cloud API

1. En https://developers.facebook.com crear una app tipo **Business** y agregar el producto **WhatsApp**.
2. En _WhatsApp → API Setup_: anotar `Phone number ID` (env `RECEIPT_WA_PHONE_NUMBER_ID`). Para desarrollo sirve el número de prueba; para producción hay que agregar y verificar un número propio.
3. En _App settings → Basic_: copiar `App secret` (env `RECEIPT_WA_APP_SECRET`).
4. Crear un **System user** en Meta Business Suite con rol admin sobre la app, y generar un token permanente con permisos `whatsapp_business_messaging` y `whatsapp_business_management` (env `RECEIPT_WA_ACCESS_TOKEN`). El token temporal del panel expira en 24 h.
5. Definir un `RECEIPT_WA_VERIFY_TOKEN` largo y aleatorio (`openssl rand -hex 32`).
6. En _WhatsApp → Configuration → Webhook_: URL `https://<dominio-backend>/receipts/webhook`, verify token igual al env. Meta hace un `GET` y espera el `hub.challenge`. Suscribirse al campo `messages`.
7. Con número de prueba, agregar los números destinatarios como _testers_ en la misma pantalla de API Setup; Meta solo entrega mensajes de números registrados.

## 4. Variables de entorno

Ver bloque `RECEIPT_*` en `.env.example`. `REDIS_URL` es obligatorio: sin Redis no hay cola.

`RECEIPT_MESSAGING_SOURCE` elige cómo se envían los avisos al remitente: `real` (por defecto; `meta` sigue aceptándose como alias) usa la API de WhatsApp Cloud o la Bot API de Telegram según el canal del remitente; `local` los imprime en los logs del servidor como `text_local`, útil para pruebas sin credenciales.

Variables de la extracción con LLM:

- `RECEIPT_EXTRACTION_MODEL`: modelo multimodal usado para leer las boletas.
- `RECEIPT_EXTRACTION_MAX_OUTPUT_TOKENS`: tope de tokens de salida por llamada.
- `RECEIPT_EXTRACTION_TIMEOUT_MS`: timeout de la llamada al proveedor.
- `RECEIPT_MIN_CONFIDENCE`: confianza mínima (0-1) para que un ítem no dispare revisión manual.
- `RECEIPT_TOTAL_TOLERANCE_CLP`: diferencia máxima en CLP entre el total declarado y la suma de ítems antes de marcar `total_mismatch`.
- `RECEIPT_MONTHLY_EXTRACTION_CAP`: tope de extracciones por pareja y mes calendario.

Variables de la normalización con LLM:

- `RECEIPT_NORMALIZATION_MODEL`: modelo pequeño usado para desambiguar merchants y productos.
- `RECEIPT_NORMALIZATION_MAX_OUTPUT_TOKENS`: tope de tokens de salida por llamada.
- `RECEIPT_MATCH_HIGH`: similitud trigram mínima para dar por bueno un match automático.
- `RECEIPT_MATCH_LOW`: similitud trigram mínima para considerar un candidato; por debajo se crea uno nuevo directo.
- `RECEIPT_CANDIDATE_LIMIT`: cantidad máxima de candidatos por búsqueda de similitud.

`OPENAI_API_KEY` es obligatoria para que la extracción funcione.

Variables del barrido de grupos huérfanos:

- `RECEIPT_SWEEP_INTERVAL_MINUTES`: cada cuántos minutos corre el barrido (job programado `sweep-stale-groups`).
- `RECEIPT_STALE_EXTRACTING_MINUTES`: minutos desde que un grupo quedó en `extracting` (columna `closed_at`) antes de reencolar su extracción.

El barrido reencola `extract-group` para grupos `extracting` cuya extracción nunca llegó a encolarse o se perdió (el proceso murió entre marcar el grupo y encolar el job), y encola un `close-group` por ventana para grupos `collecting` cuyo `last_image_at` supera el doble de `RECEIPT_GROUP_WINDOW_SECONDS` sin haber recibido el cierre programado. Ambos casos son idempotentes: el procesador de extracción exige que el grupo siga en `extracting`, y el de cierre recalcula la página máxima antes de decidir.

## 5. Prueba local sin Meta

1. `RECEIPT_MEDIA_SOURCE=local` y `RECEIPT_LOCAL_MEDIA_DIR=./tmp/receipt-media` en `.env`.
2. Copiar una foto de boleta a `tmp/receipt-media/boleta-1.jpg`.
3. Insertar en `receipt_allowed_senders` el número simulado, por defecto `+56900000000` (configurable con `RECEIPT_SIMULATE_SENDER`; para Telegram, `tg:100000000`).
4. `npm run start:dev`.
5. `npm run receipts:simulate -- boleta-1.jpg` (usa `RECEIPT_SIMULATE_SENDER` y `RECEIPT_SIMULATE_BASE_URL`, este último por defecto `http://localhost:3000`).
6. Verificar en logs `job_enqueued`, luego `image_stored`, y en Supabase: fila en `receipt_images`, objeto `.webp` en el bucket.
7. `npm run receipts:simulate -- --text "listo"` cierra el grupo abierto de inmediato. Verificar en logs `group_closed`, luego `job_enqueued name=extract-group` y `extraction_done group=... status=ready|needs_review items=N tokens=I/O`, luego `job_enqueued name=normalize-group` y `normalize_group_done group=... merchant=matched|created matched=N created=N`, y el aviso final `text_local ... body="Boleta lista: ..."` o `"... necesita revisión ..."`. En la base, `select description_raw, category, qty, unit_price, amount, confidence, position from receipt_items where group_id = '<id>' order by position;` debe listar los ítems extraídos.
8. Verificar la normalización en la base:

```sql
select i.description_raw, p.canonical_name, p.default_category, p.aliases
from receipt_items i left join receipt_products p on p.id = i.product_id
where i.group_id = '<id>' order by i.position;
select g.merchant_raw, m.canonical_name, m.rut, m.aliases
from receipt_groups g left join receipt_merchants m on m.id = g.merchant_id where g.id = '<id>';
```

**Acuse de recibo:** al guardar la primera imagen de un grupo el remitente recibe "Boleta recibida, la estoy procesando…"; las páginas siguientes del mismo grupo no repiten el aviso, de modo que una boleta de varias fotos genera un solo mensaje. Una foto ya cargada (mismo sha256 para la pareja) responde "Esa foto ya la tenía, no la sumé de nuevo." en vez de descartarse en silencio. Un reintento del webhook sobre el mismo `channel_message_id` no notifica. El acuse sale después de descargar, convertir y persistir la imagen, así que confirma almacenamiento real, no solo recepción. Depende de `RECEIPT_WORKER_CONCURRENCY=1` (default): con concurrencia mayor, dos fotos simultáneas podrían resolver ambas como página 1 y duplicar el aviso.

Al cerrar, el grupo pasa a `extracting`, se leen sus imágenes desde Storage y un modelo multimodal extrae los ítems. El resultado queda en `receipt_items` y `receipt_extractions`; el grupo termina en `ready` o `needs_review` (motivos en `review_reasons`) y el remitente recibe un resumen. Tras 3 intentos fallidos el grupo queda `failed` y se avisa. El tope mensual por pareja (`RECEIPT_MONTHLY_EXTRACTION_CAP`) se controla en `receipt_extraction_usage`.

Tras la extracción se encola `normalize-group`: merchant por RUT o similitud trigram, productos por similitud; solo la zona ambigua (entre `RECEIPT_MATCH_LOW` y `RECEIPT_MATCH_HIGH`) consulta al modelo pequeño, en una sola llamada por boleta. Las decisiones se guardan como `aliases` en `receipt_products` / `receipt_merchants`.

**Nombre legible del producto:** la extracción devuelve, además de `description_raw` (transcripción literal, nunca se altera), un `product_name` con las abreviaciones expandidas (`MANT 250G` → `Mantequilla 250 g`); se guarda en `receipt_items.product_name_suggested` y es `null` si el modelo no pudo deducirlo. Al crear un producto que no existe, `canonical_name` toma ese nombre y el raw en mayúsculas queda sembrado en `aliases`, de modo que la próxima boleta con la misma abreviación matchee por alias (`findCandidates` puntúa con `greatest(similarity(canonical_name), max(similarity(aliases)))`). Sin ese alias se crearía un producto duplicado por boleta. Los productos creados antes de este cambio conservan su nombre crudo.

`RECEIPT_WORKER_CONCURRENCY` debe quedarse en 1: el índice único evita grupos duplicados, pero la asignación de `page_index` no es atómica y con más de un worker dos fotos del mismo grupo pueden pisarse en Storage.

## 6. Migraciones

La migración `drizzle/0004_daffy_triton.sql` (tablas `receipt_*`) se aplicó con `psql --single-transaction -f drizzle/0004_daffy_triton.sql` porque `drizzle.__drizzle_migrations` está vacía en esta base de datos. **Nunca correr `npm run db:migrate` contra esta base**: reproduciría las migraciones 0000-0004 desde cero y fallaría al chocar con objetos ya existentes. Las migraciones futuras deben aplicarse de la misma forma (`psql --single-transaction -f <archivo>`) hasta que `drizzle.__drizzle_migrations` refleje el historial real.

La migración `drizzle/0005_familiar_silver_sable.sql` se aplicó de la misma forma (`psql --single-transaction`) el 2026-09-04.

La migración `drizzle/0006_talented_blade.sql` (columna `merchant_rut` en `receipt_groups`) se aplicó de la misma forma (`psql --single-transaction`) el 2026-09-05.

La migración `drizzle/0007_sender_address.sql` (renombres `phone_e164`/`sender_phone_e164` → `sender_address`, `wa_message_id` → `channel_message_id`, generada a mano porque `drizzle-kit generate` pide confirmar renombres de forma interactiva) se aplica de la misma forma; ver §10.

La migración `drizzle/0003_wakeful_famine.sql` (tablas `monthly_incomes` y `monthly_deductions`, de la rama `feat/guardar-simulacion`) se aplicó de la misma forma el 2026-09-06, después de 0004-0006. En la base de datos el orden real es 0004, 0005, 0006, 0003; el journal de Drizzle las lista 0003 → 0006, lo que es equivalente porque ninguna depende de otra.

## 7. Uso de tokens y latencia

Consulta mensual de uso de la extracción, por modelo:

```sql
select date_trunc('month', created_at) as mes, model, count(*) as llamadas,
       sum(tokens_in) as tokens_in, sum(tokens_out) as tokens_out,
       round(avg(latency_ms)) as latencia_ms
from receipt_extractions
group by 1, 2
order by 1 desc;
```

## 8. API REST para la web

Todas las rutas requieren `Authorization: Bearer <token>` (mismo `AuthGuard` que el resto de la API) y resuelven la pareja desde el perfil autenticado. Un grupo de otra pareja responde `404`.

| Método | Ruta | Descripción |
| --- | --- | --- |
| GET | `/receipts/access` | `{ enabled }` según `receipt_allowed_senders`. Controla si la web muestra la pestaña "Boletas". |
| GET | `/receipts/groups?month&year` | `{ groups, undated }`: boletas del mes por `receipt_date` (sin `discarded`) y boletas sin fecha. |
| GET | `/receipts/groups/:id` | Detalle con ítems (nombre de producto si está normalizado), imágenes con `signedUrl` (expira en `RECEIPT_SIGNED_URL_TTL_SECONDS`) y datos de la extracción. Nunca expone el path de Storage. |
| PATCH | `/receipts/groups/:id` | Edita `receiptDate`, `merchantRaw`, `totalDeclared`; con `status: ready|discarded` fija el estado, sin `status` recalcula la revisión. Una boleta `discarded` solo acepta `status: ready`. |
| PUT | `/receipts/groups/:id/items` | Reemplaza todos los ítems (`descriptionRaw`, `category`, `amount`, `qty?`, `unitPrice?`, `productId?`) y recalcula la revisión. Un `productId` corregido por la persona se guarda como alias del producto. |
| POST | `/receipts/groups/:id/normalize` | Reencola la normalización de una boleta `ready|needs_review`. Única vía de recuperación si `normalize-group` agotó sus intentos. |
| GET | `/receipts/summary?month&year` | Total, cantidad de boletas y desglose por categoría del mes. Solo grupos `ready`. |
| GET | `/receipts/comparison?months` | Últimos N meses (1-24, default 6) con total y desglose por categoría, del más antiguo al más reciente. |

Los montos viajan como strings (Postgres `numeric`); la web los convierte a número en su mapper.

Prueba manual: obtener un token con `POST /auth/login` y luego `curl -H "Authorization: Bearer <token>" http://localhost:3000/receipts/access` → `{"enabled":true}` para un usuario de la allowlist. Sin token la API responde `401`.

## 9. Consultas por chat (tool calling)

Preguntas en lenguaje natural sobre las boletas de la pareja, por dos canales:

- **WhatsApp:** cualquier texto de un remitente de la allowlist que no sea `listo` encola `answer-query`; la respuesta llega como mensaje de texto (`notify-user`).
- **Web:** `POST /receipts/query` con `{ "message": "<2-500 caracteres>" }` responde `{ "answer": string }`. Mismo `AuthGuard` que el resto de la API; la pestaña "Boletas" monta el chat al final.

El modelo (`RECEIPT_QUERY_MODEL`) solo puede llamar cinco tools de **solo lectura**, siempre filtradas por `couple_id` en SQL parametrizado fijo (nunca text-to-SQL). Los argumentos se validan con Zod antes de ejecutar; un argumento inválido vuelve al modelo como `{ error: 'invalid_arguments' }`.

| Tool | Argumentos | Devuelve |
| --- | --- | --- |
| `get_month_summary` | `year`, `month` | total del mes, cantidad de boletas y desglose por categoría |
| `get_top_products` | `year`, `month`, `limit` (1-10 o null) | productos con mayor gasto (nombre canónico o descripción) |
| `get_category_spend` | `category`, `from`, `to` (≤ 366 días) | total y detalle por mes de una categoría |
| `list_category_items` | `category`, `year`, `month`, `limit` (1-20 o null) | productos comprados en esa categoría, con monto, fecha y comercio, ordenados por monto |
| `search_items` | `text` (2-80), `year`, `month` | ítems cuya descripción o producto contiene el texto, con fecha, comercio y monto (máx. 20) |

Solo se consideran boletas `ready`. Las tools no filtran por comercio: una pregunta "¿qué compré en Jumbo?" solo se resuelve si el texto aparece en los ítems.

**Memoria conversacional:** cada hilo guarda sus últimos turnos en Redis (`receipts:query:history:<threadId>`), de modo que un seguimiento como "dame el detalle" reutiliza el período y la categoría del turno anterior. El hilo es el `senderAddress` en Telegram/WhatsApp y el `user.id` en la web, así que los miembros de una pareja no comparten conversación. No se guardan las respuestas de fallback (rate limit, sin resolver, vacía), y los turnos que matchean patrones de inyección (`detectPromptInjection`, en `src/common/utils/prompt-injection.ts`) no se persisten ni se reenvían al modelo. Si Redis falla al guardar, la respuesta igual se entrega y se registra `query_history_append_failed`.

Límites y variables:

| Variable | Default | Efecto |
| --- | --- | --- |
| `RECEIPT_QUERY_MODEL` | obligatoria | modelo del chat (`gpt-5.4-mini` en el piloto) |
| `RECEIPT_QUERY_MAX_TOOL_ROUNDS` | 3 | rondas de tools por pregunta; al agotarlas responde "No pude resolver la consulta" |
| `RECEIPT_QUERY_MAX_OUTPUT_TOKENS` | 1200 | tope de salida por llamada |
| `RECEIPT_QUERY_TIMEOUT_MS` | 30000 | timeout por llamada al modelo |
| `RECEIPT_QUERY_TEMPERATURE` / `RECEIPT_QUERY_REASONING_EFFORT` | 0 / vacío | parámetros del modelo (dejar vacíos si el modelo no los acepta) |
| `RECEIPT_QUERY_RATE_LIMIT_MAX` / `_WINDOW_SECONDS` | 10 / 60 | límite por pareja, compartido entre WhatsApp y web (`rl:receipts:query:<coupleId>`) |
| `RECEIPT_QUERY_MAX_MESSAGE_CHARS` | 500 | recorte del mensaje antes de enviarlo al modelo |
| `RECEIPT_QUERY_HISTORY_MAX_TURNS` | 8 | turnos de conversación que se reenvían al modelo por hilo |
| `RECEIPT_QUERY_HISTORY_TTL_SECONDS` | 1800 | vida del historial en Redis; al expirar el hilo empieza en blanco |
| `RECEIPT_QUERY_HISTORY_MAX_TURN_CHARS` | 700 | recorte de cada turno guardado |

Seguridad: el texto del usuario nunca entra al system prompt (viaja como turno de usuario), el modelo no recibe ids ni paths, y los logs solo registran `couple`, cantidad de tools, tokens y latencia (`query_answered couple=<id> history=<n> tools=<n> tokens=<in>/<out> latency=<ms> exhausted=<bool>`), nunca la pregunta ni la respuesta. El servicio antepone `Hoy es <fecha en America/Santiago>` a la pregunta para que el modelo resuelva "este mes". El endpoint web exige además que el usuario esté en `receipt_allowed_senders` (`403` si no lo está). Al exceder el rate limit ambos canales responden con el texto fijo "Demasiadas consultas, intenta en un minuto." (en la web con `200`, no `429`). Si el modelo falla en WhatsApp, el remitente recibe "No pude resolver la consulta…" en vez de silencio.

Costo de referencia (piloto, `gpt-5.4-mini`): una pregunta con una tool consume ~1.600 tokens de entrada y ~80 de salida, 2-4 s de latencia. El gasto no se persiste en `receipt_extractions` (no está ligado a una boleta); vigilar por el log o el panel de OpenAI.

Verificación local:

```bash
npm run receipts:simulate -- --text "¿cuánto gasté en septiembre?"
# log: job_enqueued name=answer-query → query_answered … → text_local body="…"

curl -s -X POST http://localhost:3000/receipts/query \
  -H "Authorization: Bearer <token>" -H "Content-Type: application/json" \
  -d '{"message":"¿Qué compré en septiembre?"}'
# → {"answer":"…"}; message de 1 carácter → 400; sin token → 401
```

## 10. Canal Telegram

Telegram no exige verificación del negocio, así que es el canal activo mientras la app de Meta siga sin publicar. Todo lo que ocurre después del webhook es idéntico para ambos canales.

**Direcciones de remitente.** El remitente ya no es un teléfono sino una dirección: `+56957598006` para WhatsApp y `tg:<id de usuario>` para Telegram. Las columnas `receipt_allowed_senders.sender_address`, `receipt_groups.sender_address` y `receipt_images.sender_address` (migración 0007, renombres) guardan ese valor. La allowlist sigue siendo obligatoria y por dirección.

**Crear el bot.**

1. En Telegram, hablar con `@BotFather` → `/newbot`, elegir nombre y usuario. Copiar el token a `RECEIPT_TELEGRAM_BOT_TOKEN`.
2. Definir `RECEIPT_TELEGRAM_WEBHOOK_SECRET` con `openssl rand -hex 32`. Telegram lo enviará en el header `X-Telegram-Bot-Api-Secret-Token` y el guard lo compara en tiempo constante.
3. Desplegar con ambas variables y `RECEIPT_MEDIA_SOURCE=real`, `RECEIPT_MESSAGING_SOURCE=real`.
4. Registrar el webhook una vez por entorno: `npm run receipts:telegram:set-webhook -- https://<dominio-backend>`. El script llama `setWebhook` (solo `message`, descarta updates pendientes) y muestra `getWebhookInfo`.

**Onboarding de un remitente.** Escribir cualquier cosa al bot desde el celular. El log mostrará `sender_not_allowed sender=tg:123456789`; insertar esa dirección en `receipt_allowed_senders` con el `user_id` y `couple_id` de la persona y `enabled = true`. Desde ese momento el bot responde.

**Qué acepta el bot.** Solo chats privados de personas (no grupos ni bots). Fotos (`photo`, se toma el tamaño mayor), imágenes enviadas como archivo (`document` con mime `image/*`) y texto. Texto `listo` cierra el grupo; cualquier otro texto es una consulta al chat. Stickers, audios y `edited_message` se ignoran con 200. El texto que acompaña a una foto (`caption`) también se ignora, igual que en WhatsApp: `listo` y las preguntas van como mensaje aparte, porque un comando simultáneo a la foto llegaría antes de que la imagen termine de procesarse.

**Calidad de imagen.** Telegram recomprime las fotos normales a un máximo de 1280 px de lado. Para boletas largas o poco legibles, enviarlas "como archivo" conserva la resolución original.

**Variables.**

| Variable | Default | Uso |
| --- | --- | --- |
| `RECEIPT_TELEGRAM_BOT_TOKEN` | obligatoria al primer uso | descargas (`getFile`) y envíos (`sendMessage`) |
| `RECEIPT_TELEGRAM_WEBHOOK_SECRET` | obligatoria al recibir un webhook | guard del endpoint `/receipts/telegram/webhook` |
| `RECEIPT_TELEGRAM_API_BASE_URL` | `https://api.telegram.org` | tests y proxies |

**Verificación local** (`RECEIPT_MEDIA_SOURCE=local`, `RECEIPT_MESSAGING_SOURCE=local`, dirección `tg:100000000` en la allowlist):

```bash
npm run receipts:simulate -- --telegram boleta-01.jpg
npm run receipts:simulate -- --telegram --text listo
# log: telegram_update_received → job_enqueued name=ingest-image → … → text_local to=tg:100000000 body="Boleta lista: …"
npm run receipts:simulate -- --telegram --text "¿cuánto gasté este mes?"
```

Logs propios del canal: `telegram_update_received`, `telegram_update_unrecognized`, `telegram_webhook_rejected reason=<missing_header|missing_secret|mismatch>`, `telegram_text_sent to=tg:…`, `telegram_text_truncated`. El token del bot y las URLs de descarga nunca se loguean.
