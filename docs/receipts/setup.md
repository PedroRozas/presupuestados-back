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

Una fila por persona autorizada. `phone_e164` con `+` y código de país. `user_id` es `profiles.id`; `couple_id` es `profiles.couple_id` de esa persona.

```sql
insert into receipt_allowed_senders (phone_e164, user_id, couple_id)
select '+569XXXXXXXX', p.id, p.couple_id
from profiles p
where p.email = 'correo@ejemplo.com';
```

Deshabilitar sin borrar: `update receipt_allowed_senders set enabled = false where phone_e164 = '+569XXXXXXXX';`

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

`RECEIPT_MESSAGING_SOURCE` elige cómo se envían los avisos al remitente: `meta` (por defecto) usa la API de WhatsApp Cloud; `local` los imprime en los logs del servidor como `whatsapp_text_local`, útil para pruebas sin credenciales de Meta.

## 5. Prueba local sin Meta

1. `RECEIPT_MEDIA_SOURCE=local` y `RECEIPT_LOCAL_MEDIA_DIR=./tmp/receipt-media` en `.env`.
2. Copiar una foto de boleta a `tmp/receipt-media/boleta-1.jpg`.
3. Insertar en `receipt_allowed_senders` el número simulado, por defecto `+56900000000` (configurable con `RECEIPT_SIMULATE_PHONE`).
4. `npm run start:dev`.
5. `npm run receipts:simulate -- boleta-1.jpg` (usa `RECEIPT_SIMULATE_PHONE` y `RECEIPT_SIMULATE_BASE_URL`, este último por defecto `http://localhost:3000`).
6. Verificar en logs `job_enqueued`, luego `image_stored`, y en Supabase: fila en `receipt_images`, objeto `.webp` en el bucket.
7. `npm run receipts:simulate -- --text "listo"` cierra el grupo abierto de inmediato. Verificar en logs `group_closed` y `whatsapp_text_local`, y en la base `status = 'needs_review'`, `review_reasons = '{extraction_pending}'`, `closed_at` no nulo.

En fase 2 los grupos se cierran solos 90 s después de la última foto (`RECEIPT_GROUP_WINDOW_SECONDS`) o de inmediato al enviar el texto `listo`. Al cerrar quedan en `needs_review` con motivo `extraction_pending` y el remitente recibe un aviso. Con `RECEIPT_MESSAGING_SOURCE=local` el aviso se imprime en los logs del servidor en vez de enviarse a WhatsApp.

`RECEIPT_WORKER_CONCURRENCY` puede subirse; el índice único parcial `idx_receipt_groups_one_collecting_per_sender` evita grupos duplicados.

## 6. Migraciones

La migración `drizzle/0004_daffy_triton.sql` (tablas `receipt_*`) se aplicó con `psql --single-transaction -f drizzle/0004_daffy_triton.sql` porque `drizzle.__drizzle_migrations` está vacía en esta base de datos. **Nunca correr `npm run db:migrate` contra esta base**: reproduciría las migraciones 0000-0004 desde cero y fallaría al chocar con objetos ya existentes. Las migraciones futuras deben aplicarse de la misma forma (`psql --single-transaction -f <archivo>`) hasta que `drizzle.__drizzle_migrations` refleje el historial real.
