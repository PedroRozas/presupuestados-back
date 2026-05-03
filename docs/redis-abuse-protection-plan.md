# Plan: Redis, rate limiting y protección contra abuso

Fecha: 2026-05-03  
Repositorio involucrado: `presupuestados-back`

---

## Resumen

Agregar Redis al backend para reducir abuso operativo y ataques de alta frecuencia:

- Floods de requests contra la API.
- Fuerza bruta en login.
- Enumeración o abuso de recuperación de contraseña.
- Uso excesivo de endpoints de IA.
- Spam contra chatbot.
- Reintentos agresivos contra refresh tokens.
- Señales tempranas de comportamiento sospechoso.

Redis no reemplaza autenticación, autorización, validación de DTOs, logs persistentes ni reglas de negocio. Su rol recomendado es ser una capa rápida y distribuida para contadores temporales, cooldowns y bloqueos con TTL.

---

## Objetivos

1. Aplicar límites globales por IP antes de ejecutar lógica costosa.
2. Aplicar límites específicos por ruta en endpoints sensibles.
3. Aplicar límites por usuario autenticado en endpoints de IA y chatbot.
4. Registrar eventos de seguridad relevantes sin guardar secretos ni tokens.
5. Mantener la lógica de límites mensuales de IA en Postgres como fuente de verdad de negocio.
6. Diseñar la solución para funcionar con múltiples instancias del backend.

---

## Estado actual

### Backend

- `src/main.ts`
  - Usa `cookie-parser`.
  - Habilita CORS.
  - Usa `ValidationPipe` global con `whitelist`, `forbidNonWhitelisted` y `transform`.
  - No configura `helmet`.
  - No define límite explícito de body.
  - No configura `trust proxy`.
  - No aplica rate limiting global.

- `src/common/guards/auth.guard.ts`
  - Valida JWT contra Supabase Auth.
  - Inyecta `req.user`.
  - No cachea validaciones de token.

- `src/ai-usage/ai-usage.service.ts`
  - Controla cupos mensuales de IA en Postgres.
  - La lógica es correcta para límites de producto, pero no está pensada para bloquear bursts por minuto.

- `src/chatbot/chatbot.service.ts`
  - Tiene validaciones de prompt y límite mensual por `AIUsageService`.
  - No tiene cooldown por usuario/IP.

---

## Decisiones de arquitectura

1. Redis será usado para límites temporales, no para autorización.
2. Postgres seguirá guardando límites mensuales de IA, auditoría persistente y datos de negocio.
3. La primera versión usará rate limits conservadores y configurables por variables de entorno.
4. Las claves de Redis no deben incluir emails completos, tokens, prompts ni datos personales crudos.
5. Para identificadores sensibles, usar hash estable con sal del backend.
6. Si Redis falla, la política inicial recomendada es `fail-open` para endpoints normales y `fail-closed` opcional para endpoints de IA costosos.
7. Los límites deben devolver `429 Too Many Requests` con contrato JSON estable.

---

## Dependencias recomendadas

Instalar:

```bash
npm install ioredis helmet
```

Opcional si se decide usar integración oficial de Nest:

```bash
npm install @nestjs/throttler
```

Recomendación práctica:

- Usar `ioredis` directamente para tener control fino sobre claves por IP, usuario, ruta y eventos.
- Evaluar `@nestjs/throttler` solo si el caso se mantiene simple.

---

## Variables de entorno

Agregar a `.env.example`:

```bash
REDIS_URL=
RATE_LIMIT_HASH_SALT=
TRUST_PROXY=false

RATE_LIMIT_GLOBAL_WINDOW_SECONDS=60
RATE_LIMIT_GLOBAL_MAX=120

RATE_LIMIT_AUTH_WINDOW_SECONDS=900
RATE_LIMIT_AUTH_MAX=10

RATE_LIMIT_PASSWORD_RESET_WINDOW_SECONDS=3600
RATE_LIMIT_PASSWORD_RESET_MAX=5

RATE_LIMIT_CHATBOT_WINDOW_SECONDS=60
RATE_LIMIT_CHATBOT_MAX=10

RATE_LIMIT_AI_WINDOW_SECONDS=300
RATE_LIMIT_AI_MAX=5
```

Notas:

- `RATE_LIMIT_HASH_SALT` debe ser un secreto distinto de JWT/Supabase.
- En producción detrás de proxy/CDN, `TRUST_PROXY` debe configurarse de forma explícita según el proveedor.
- Si se usa Upstash, Redis Cloud, Render Redis u otro servicio administrado, `REDIS_URL` debe usar TLS si el proveedor lo requiere.

---

## Arquitectura backend propuesta

Crear un módulo nuevo:

```text
src/security/
├── decorators/
│   └── rate-limit.decorator.ts
├── guards/
│   └── rate-limit.guard.ts
├── security.constants.ts
├── security.module.ts
├── security.types.ts
├── redis.service.ts
├── rate-limit.service.ts
└── security-events.service.ts
```

### `RedisService`

Responsabilidades:

- Crear y exponer cliente Redis.
- Validar conexión al iniciar.
- Manejar reconexión y logging.
- Exponer métodos mínimos, no el cliente completo a todo el backend.

Métodos sugeridos:

```ts
interface RedisService {
  incrementWithTtl(key: string, ttlSeconds: number): Promise<number>
  getTtl(key: string): Promise<number>
  setCooldown(key: string, ttlSeconds: number): Promise<void>
  exists(key: string): Promise<boolean>
}
```

### `RateLimitService`

Responsabilidades:

- Construir claves seguras.
- Aplicar límites por ventana.
- Retornar metadata del límite.
- Centralizar política de fallback si Redis falla.

Contrato sugerido:

```ts
interface RateLimitResult {
  allowed: boolean
  limit: number
  remaining: number
  retryAfterSeconds: number
  key: string
}
```

### `RateLimitGuard`

Responsabilidades:

- Leer metadata de ruta.
- Detectar IP real de forma confiable.
- Detectar usuario autenticado cuando exista `req.user`.
- Lanzar `TooManyRequestsException` con respuesta consistente.

### `SecurityEventsService`

Responsabilidades:

- Loguear eventos de abuso con `Logger`.
- Preparar una futura persistencia en DB si hace falta.
- No loguear tokens, cookies, prompts completos ni payloads sensibles.

Eventos mínimos:

- `rate_limit_exceeded`
- `auth_login_failed`
- `auth_login_blocked`
- `password_reset_limited`
- `chatbot_rate_limited`
- `ai_rate_limited`
- `redis_unavailable`

---

## Estrategia de claves Redis

Usar prefijos claros y valores hasheados cuando corresponda.

Ejemplos:

```text
rl:global:ip:{ipHash}
rl:route:{routeKey}:ip:{ipHash}
rl:auth:login:ip:{ipHash}
rl:auth:login:email:{emailHash}
rl:auth:login:combo:{ipHash}:{emailHash}
rl:user:{userIdHash}:chatbot
rl:user:{userIdHash}:ai
cooldown:auth:login:ip:{ipHash}
cooldown:auth:login:combo:{ipHash}:{emailHash}
```

Reglas:

- No guardar IP cruda si no es necesario.
- No guardar email crudo.
- No guardar JWT, refresh token, cookies ni prompts.
- `userId` puede hashearse también para consistencia.
- Todas las claves de rate limit deben tener TTL.

---

## Límites recomendados para primera versión

Los valores son punto de partida. Deben ajustarse con métricas reales.

### Global

```text
120 requests / 60 segundos por IP
```

Aplica a toda la API salvo health checks.

### Auth login

```text
10 intentos / 15 minutos por IP
5 intentos / 15 minutos por email
5 intentos / 15 minutos por combinación IP + email
```

Al superar límites:

```text
cooldown 15 minutos
```

### Register

```text
5 intentos / hora por IP
3 intentos / hora por email
```

### Forgot password

```text
5 intentos / hora por IP
3 intentos / hora por email
```

Respuesta siempre genérica para evitar enumeración:

```json
{
  "message": "Si el correo existe, recibirás instrucciones para recuperar tu contraseña."
}
```

### Refresh token

```text
30 intentos / 15 minutos por IP
30 intentos / 15 minutos por usuario si se puede identificar
```

### Chatbot

```text
10 mensajes / minuto por usuario
30 mensajes / 10 minutos por IP
```

Estos límites son adicionales al cupo mensual de `AIUsageService`.

### Escaneo de cartolas con IA

```text
5 escaneos / 5 minutos por usuario
10 escaneos / 15 minutos por IP
```

Estos límites son adicionales al cupo mensual de `AIUsageService`.

---

## Contrato de error recomendado

Responder con `429 Too Many Requests`:

```json
{
  "code": "RATE_LIMIT_EXCEEDED",
  "scope": "chatbot",
  "limit": 10,
  "remaining": 0,
  "retryAfterSeconds": 42,
  "message": "Demasiadas solicitudes. Intenta nuevamente en unos segundos."
}
```

Headers recomendados:

```http
Retry-After: 42
X-RateLimit-Limit: 10
X-RateLimit-Remaining: 0
X-RateLimit-Reset: 1714700000
```

---

## Hardening HTTP recomendado

### `helmet`

Agregar en `src/main.ts`:

- Headers de seguridad básicos.
- Revisar CSP con cuidado si Swagger está habilitado en desarrollo.

### Límite de body

Configurar límite explícito:

```text
JSON normal: 1mb
Uploads de cartolas: límite específico con multer
```

No permitir que endpoints normales reciban cuerpos grandes.

### `trust proxy`

Configurar solo si producción está detrás de proxy/CDN.

Riesgo:

- Si queda mal configurado, un atacante podría manipular `X-Forwarded-For`.
- Si no se configura cuando corresponde, todos los usuarios pueden verse como la IP del proxy.

Decisión:

- Local: `false`.
- Producción: configurar según infraestructura real.

---

## Fases de implementación

### Fase 1: base de seguridad HTTP

1. Instalar `helmet`.
2. Configurar `helmet` en `src/main.ts`.
3. Configurar body limit explícito.
4. Agregar `TRUST_PROXY` a `.env.example`.
5. Documentar configuración esperada por entorno.
6. Probar que Swagger sigue funcionando en desarrollo.

Resultado esperado:

- API con headers básicos de seguridad.
- Menor riesgo de payloads enormes.
- Base correcta para detectar IP.

### Fase 2: Redis y módulo de rate limit

1. Instalar `ioredis`.
2. Crear `SecurityModule`.
3. Crear `RedisService`.
4. Crear `RateLimitService`.
5. Crear `RateLimitGuard`.
6. Crear decorador `@RateLimit()`.
7. Agregar configuración por variables de entorno.
8. Agregar tests unitarios de `RateLimitService`.

Resultado esperado:

- Rate limit reusable y tipado.
- Redis encapsulado.
- Claves con TTL.

### Fase 3: límites globales

1. Aplicar rate limit global.
2. Excluir health checks si existen.
3. Loguear `rate_limit_exceeded`.
4. Validar headers `Retry-After` y `X-RateLimit-*`.
5. Probar con múltiples requests concurrentes.

Resultado esperado:

- La API completa queda protegida contra floods simples.

### Fase 4: endpoints de auth

1. Aplicar límite a login por IP.
2. Aplicar límite a login por email hasheado.
3. Aplicar límite a login por combinación IP + email.
4. Aplicar cooldown temporal después de exceso de fallos.
5. Aplicar límite a register.
6. Aplicar límite a forgot password.
7. Aplicar límite a refresh.
8. Agregar logs de intentos fallidos y bloqueos.

Resultado esperado:

- Menor riesgo de fuerza bruta y enumeración.
- Mejor visibilidad de abuso de autenticación.

### Fase 5: IA y chatbot

1. Aplicar límite por usuario a `POST /chatbot/chat`.
2. Aplicar límite por IP a `POST /chatbot/chat`.
3. Aplicar límite por usuario a endpoints de escaneo IA.
4. Aplicar límite por IP a endpoints de escaneo IA.
5. Mantener `AIUsageService` como límite mensual de negocio.
6. Ajustar mensajes del frontend si recibe `RATE_LIMIT_EXCEEDED`.

Resultado esperado:

- Se bloquean bursts de IA antes de gastar tokens.
- Los cupos mensuales siguen funcionando sin mezclarse con Redis.

### Fase 6: observabilidad y respuesta

1. Estandarizar logs de seguridad.
2. Crear query o dashboard operativo si existe stack de logs.
3. Definir alertas mínimas:
   - Muchos bloqueos por IP.
   - Muchos bloqueos en login.
   - Muchos bloqueos de IA.
   - Redis desconectado.
4. Evaluar persistir eventos críticos en Postgres.

Resultado esperado:

- Se puede detectar abuso real y ajustar límites con datos.

---

## Tests recomendados

### Unitarios

- `RateLimitService` incrementa contador y respeta TTL.
- `RateLimitService` bloquea cuando supera límite.
- `RateLimitService` calcula `remaining` y `retryAfterSeconds`.
- Hash de claves no expone email ni IP cruda.
- Fallback ante error de Redis respeta la política configurada.

### Integración

- Login devuelve `429` al superar límite.
- Forgot password no permite enumeración.
- Chatbot devuelve `429` antes de llamar al proveedor IA.
- Escaneo IA devuelve `429` antes de llamar a OpenAI.
- Global limit afecta rutas normales.

### Manuales

Comandos sugeridos:

```bash
npm run test
npm run test:e2e
npm run lint
```

Prueba de carga simple local:

```bash
for i in {1..150}; do curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/; done
```

---

## Riesgos y mitigaciones

### Redis caído

Riesgo:

- El backend puede perder rate limiting temporal.

Mitigación:

- Loguear `redis_unavailable`.
- Definir `fail-open` por defecto para no botar la app completa.
- Considerar `fail-closed` solo para endpoints de IA si el costo lo justifica.

### IP mal detectada

Riesgo:

- Límites injustos para usuarios reales o bypass por headers falsos.

Mitigación:

- Configurar `trust proxy` por entorno.
- Documentar infraestructura real.
- Probar IP detectada en staging.

### Límites demasiado agresivos

Riesgo:

- Usuarios legítimos bloqueados.

Mitigación:

- Empezar conservador.
- Loguear antes de endurecer.
- Ajustar por datos.

### Exposición de datos en claves/logs

Riesgo:

- Redis o logs contienen PII innecesaria.

Mitigación:

- Hash con sal para email/IP/userId.
- No loguear payloads sensibles.
- No guardar prompts completos.

---

## Checklist final

- [ ] `helmet` instalado y configurado.
- [ ] Body limit explícito configurado.
- [ ] `trust proxy` definido por entorno.
- [ ] `.env.example` actualizado con Redis y rate limits.
- [ ] `SecurityModule` creado.
- [ ] `RedisService` creado.
- [ ] `RateLimitService` creado.
- [ ] `RateLimitGuard` creado.
- [ ] Decorador `@RateLimit()` creado.
- [ ] Rate limit global activo.
- [ ] Límites aplicados a login.
- [ ] Límites aplicados a register.
- [ ] Límites aplicados a forgot password.
- [ ] Límites aplicados a refresh.
- [ ] Límites aplicados a chatbot.
- [ ] Límites aplicados a escaneo IA.
- [ ] Contrato `RATE_LIMIT_EXCEEDED` implementado.
- [ ] Logs de seguridad agregados.
- [ ] Tests unitarios agregados.
- [ ] Tests e2e o integración agregados.
- [ ] Documentación de despliegue Redis agregada.
- [ ] Valores revisados tras métricas reales de producción.

---

## Recomendación de prioridad

Orden recomendado:

1. `helmet`, body limit y `trust proxy`.
2. Redis + rate limit global.
3. Auth: login, register, forgot password y refresh.
4. Chatbot e IA.
5. Observabilidad y ajuste fino.

La mayor ganancia temprana está en auth e IA: son las superficies con más valor para un atacante y mayor costo operativo para el proyecto.
