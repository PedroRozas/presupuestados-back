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
2. En *WhatsApp → API Setup*: anotar `Phone number ID` (env `RECEIPT_WA_PHONE_NUMBER_ID`). Para desarrollo sirve el número de prueba; para producción hay que agregar y verificar un número propio.
3. En *App settings → Basic*: copiar `App secret` (env `RECEIPT_WA_APP_SECRET`).
4. Crear un **System user** en Meta Business Suite con rol admin sobre la app, y generar un token permanente con permisos `whatsapp_business_messaging` y `whatsapp_business_management` (env `RECEIPT_WA_ACCESS_TOKEN`). El token temporal del panel expira en 24 h.
5. Definir un `RECEIPT_WA_VERIFY_TOKEN` largo y aleatorio (`openssl rand -hex 32`).
6. En *WhatsApp → Configuration → Webhook*: URL `https://<dominio-backend>/receipts/webhook`, verify token igual al env. Meta hace un `GET` y espera el `hub.challenge`. Suscribirse al campo `messages`.
7. Con número de prueba, agregar los números destinatarios como *testers* en la misma pantalla de API Setup; Meta solo entrega mensajes de números registrados.

## 4. Variables de entorno

Ver bloque `RECEIPT_*` en `.env.example`. `REDIS_URL` es obligatorio: sin Redis no hay cola.

## 5. Prueba local sin Meta

1. `RECEIPT_MEDIA_SOURCE=local` y `RECEIPT_LOCAL_MEDIA_DIR=./tmp/receipt-media` en `.env`.
2. Copiar una foto de boleta a `tmp/receipt-media/boleta-1.jpg`.
3. Insertar en `receipt_allowed_senders` el número simulado, por defecto `+56900000000`.
4. `npm run start:dev`.
5. `npm run receipts:simulate -- boleta-1.jpg`.
6. Verificar en logs `job_enqueued`, luego `image_stored`, y en Supabase: fila en `receipt_images`, objeto `.webp` en el bucket.
