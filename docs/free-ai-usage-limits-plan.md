# Plan: Límites gratuitos mensuales para IA

Fecha: 2026-05-03  
Repositorios involucrados: `presupuestados-back`, `presupuestados-web`

---

## Resumen

Permitir que usuarios registrados sin premium prueben funcionalidades de IA con cupos mensuales:

- **Escaneo de cartolas con IA:** 2 escaneos al mes.
- **Chatbot financiero:** 10 respuestas de IA al mes.
- **Usuarios premium:** sin bloqueo por estos cupos en la primera versión.
- **Usuarios guest:** sin acceso a escaneo IA ni chatbot IA. El modo invitado queda igual.

La regla debe aplicarse en el **backend** como fuente de verdad. El frontend solo muestra estado, contadores y mensajes de upgrade.

---

## Estado actual

### Backend

- `src/ai/ai.service.ts`
  - `processStatement(userId, file, dto)` procesa archivos con OpenAI.
  - Hoy consulta `profiles.isPremium`.
  - Si `isPremium === false`, lanza `ForbiddenException('Esta función requiere suscripción premium')`.

- `src/chatbot/chatbot.service.ts`
  - `chat(userId, dto)` responde usando Gemini.
  - Hoy no verifica `isPremium`.
  - Requiere que el usuario tenga `coupleId`.

- `src/database/schema/index.ts`
  - `profiles.isPremium` ya existe.
  - No existe tabla para uso mensual de IA.

### Frontend

- `src/pages/ScanStatement.tsx`
  - Hoy bloquea la página completa para no premium con `PremiumLockedView`.

- `src/components/dashboard/general/ScanButton.tsx`
  - Hoy muestra modal premium si el usuario no es premium.

- `src/components/assistant/AssistantChat.tsx`
  - Llama a `chatbotApi.chat`.
  - Muestra errores genéricos del backend.

- `src/api/chatbot.api.ts`
  - Solo expone `POST /chatbot/chat`.

---

## Decisiones de producto

1. El cupo se reinicia por mes calendario.
2. Para Chile, el periodo de negocio recomendado es `America/Santiago`.
3. En base de datos se puede guardar `period_month` como el primer día del mes (`YYYY-MM-01`) para simplificar queries.
4. Un intento consume cupo cuando llega a llamar al proveedor de IA.
5. No consumen cupo:
   - requests rechazados por autenticación;
   - requests de guest porque no tienen acceso;
   - validaciones previas al proveedor IA, por ejemplo archivo ausente, tipo no permitido, usuario sin pareja en chatbot;
   - errores técnicos del proveedor IA si se implementa reserva + devolución.
6. Si el archivo fue enviado a la IA y no se detectaron gastos, cuenta como escaneo. Hubo costo real de procesamiento.
7. El chatbot consume cupo por cada respuesta generada, no por cada mensaje escrito localmente.

---

## Modelo de datos recomendado

Crear una tabla mensual de uso por usuario y feature:

```sql
create type ai_usage_feature as enum ('statement_scan', 'chatbot_response');

create table ai_usage_monthly (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  feature ai_usage_feature not null,
  period_month date not null,
  usage_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, feature, period_month)
);

create index idx_ai_usage_monthly_user_period
  on ai_usage_monthly (user_id, period_month);
```

### Drizzle

Agregar al schema:

- `pgEnum('ai_usage_feature', ['statement_scan', 'chatbot_response'])`
- `aiUsageMonthly`
- tipos `AIUsageMonthly` y `NewAIUsageMonthly`

Agregar migración con `npm run db:generate` o SQL manual si se prefiere mantener control fino.

---

## Contrato de límites

Crear constantes compartidas en backend:

```ts
export const AI_USAGE_LIMITS = {
  statement_scan: 2,
  chatbot_response: 10,
} as const
```

Respuesta recomendada cuando se consulta estado:

```ts
interface AIUsageStatusItem {
  feature: 'statement_scan' | 'chatbot_response'
  used: number
  limit: number
  remaining: number
  isPremium: boolean
  periodMonth: string
}
```

Error recomendado cuando se supera cupo:

```json
{
  "code": "AI_USAGE_LIMIT_REACHED",
  "feature": "statement_scan",
  "limit": 2,
  "used": 2,
  "periodMonth": "2026-05-01",
  "message": "Llegaste al límite gratuito de escaneos de este mes."
}
```

NestJS puede devolverlo con `ForbiddenException`. Si se quiere un contrato más limpio, crear una excepción propia `AIUsageLimitReachedException`.

---

## Arquitectura backend

Crear un módulo nuevo:

```text
src/ai-usage/
├── ai-usage.constants.ts
├── ai-usage.controller.ts
├── ai-usage.module.ts
├── ai-usage.service.ts
└── types.ts
```

### Responsabilidades de `AIUsageService`

- Calcular el `periodMonth` actual.
- Consultar estado de uso mensual por feature.
- Saltar validación para premium.
- Reservar cupo de forma atómica antes de llamar al proveedor IA.
- Revertir la reserva si hay error técnico.
- Entregar metadata para que el frontend muestre contadores.

### API backend nueva

```http
GET /ai-usage/status
```

Devuelve ambos cupos del usuario autenticado:

```json
{
  "statement_scan": {
    "feature": "statement_scan",
    "used": 1,
    "limit": 2,
    "remaining": 1,
    "isPremium": false,
    "periodMonth": "2026-05-01"
  },
  "chatbot_response": {
    "feature": "chatbot_response",
    "used": 4,
    "limit": 10,
    "remaining": 6,
    "isPremium": false,
    "periodMonth": "2026-05-01"
  }
}
```

### Consumo atómico

Para evitar carreras con varias pestañas abiertas, no hacer `select` y luego `update` separados sin protección.

Patrón recomendado:

1. Si `isPremium`, permitir sin tocar `ai_usage_monthly`.
2. Para free:
   - insertar fila si no existe;
   - incrementar solo si `usage_count < limit`;
   - retornar fila actualizada;
   - si no hay fila retornada, bloquear.

SQL esperado:

```sql
insert into ai_usage_monthly (user_id, feature, period_month, usage_count)
values ($1, $2, $3, 1)
on conflict (user_id, feature, period_month)
do update set
  usage_count = ai_usage_monthly.usage_count + 1,
  updated_at = now()
where ai_usage_monthly.usage_count < $4
returning usage_count;
```

Si Drizzle no permite expresar bien el `where` del `on conflict`, usar `db.execute(sql\`...\`)` para esta operación puntual.

### Devolución de reserva

Agregar método:

```ts
refundUsage(userId, feature, periodMonth)
```

Debe bajar `usage_count` con piso en `0`.

Usarlo solo cuando:

- OpenAI/Gemini falla;
- la respuesta del proveedor no se puede parsear;
- ocurre un error interno después de reservar y antes de entregar respuesta usable.

No usarlo para:

- límite alcanzado;
- input inválido;
- mensaje sospechoso;
- archivo procesado correctamente pero sin gastos detectados.

---

## Cambios backend por feature

### Escaneo IA

Archivo principal:

- `src/ai/ai.service.ts`

Cambios:

1. Reemplazar el bloqueo premium absoluto.
2. Obtener `profile.isPremium`.
3. Si no es premium, reservar cupo `statement_scan`.
4. Procesar el archivo con OpenAI.
5. Si OpenAI o parsing falla, devolver reserva.
6. Retornar metadata de uso junto a `expenses`.

Respuesta nueva sugerida:

```ts
{
  expenses: normalizedExpenses,
  usage: {
    feature: 'statement_scan',
    used: 2,
    limit: 2,
    remaining: 0,
    isPremium: false,
    periodMonth: '2026-05-01',
  },
}
```

### Chatbot

Archivo principal:

- `src/chatbot/chatbot.service.ts`

Cambios:

1. Mantener validación de perfil y `coupleId`.
2. Usar `profile.isPremium`.
3. Validar mensaje sospechoso antes de consumir cupo.
4. Si no es premium, reservar cupo `chatbot_response`.
5. Generar respuesta con Gemini y tools.
6. Si Gemini falla, devolver reserva.
7. Retornar `usage` junto a `response`.

Respuesta nueva sugerida:

```ts
{
  response: response.text,
  usage: {
    feature: 'chatbot_response',
    used: 7,
    limit: 10,
    remaining: 3,
    isPremium: false,
    periodMonth: '2026-05-01',
  },
}
```

---

## Cambios frontend

### Tipos y API

Crear o extender:

```text
src/api/ai-usage.api.ts
src/api/types/aiUsage.ts
```

Actualizar:

- `src/api/index.ts`
- `src/api/types/index.ts`
- `src/api/types/chatbot.ts`
- tipos de respuesta de `aiApi.processStatement`

Tipos sugeridos:

```ts
export type AIUsageFeature = 'statement_scan' | 'chatbot_response'

export interface AIUsageStatusItem {
  feature: AIUsageFeature
  used: number
  limit: number
  remaining: number
  isPremium: boolean
  periodMonth: string
}

export interface AIUsageStatusResponse {
  statement_scan: AIUsageStatusItem
  chatbot_response: AIUsageStatusItem
}
```

### Estado de cupos

Crear hook:

```text
src/hooks/useAIUsageStatus.ts
```

Responsabilidades:

- llamar `GET /ai-usage/status`;
- exponer `status`, `loading`, `refresh`;
- refrescar después de escaneo o respuesta del chatbot;
- no ejecutarse en guest.

### Escaneo

Archivos:

- `src/pages/ScanStatement.tsx`
- `src/hooks/useScanStatement.ts`
- `src/components/dashboard/general/ScanButton.tsx`
- `src/components/dashboard/general/PremiumDialog.tsx`
- `src/components/dashboard/general/PremiumLockedView.tsx`

Cambios:

1. Dejar que usuarios free entren a `/scan` si tienen cupo disponible.
2. Mostrar contador visible:
   - `Escaneos gratis: 1/2 usados este mes`.
3. Si `remaining === 0` y no es premium:
   - bloquear uploader;
   - mostrar CTA a premium;
   - no llamar al endpoint.
4. Si el backend responde `AI_USAGE_LIMIT_REACHED`, mostrar el mismo bloqueo aunque el frontend creyera que había cupo.
5. Para premium, mostrar texto tipo `Escaneos IA incluidos en Premium`.

### Chatbot

Archivo:

- `src/components/assistant/AssistantChat.tsx`

Cambios:

1. Mostrar contador pequeño en el header o sobre el input:
   - `6/10 respuestas IA este mes`.
2. Deshabilitar input y sugerencias si `remaining === 0` y no es premium.
3. Mostrar mensaje del asistente cuando se bloquea:
   - `Llegaste al límite gratuito de respuestas IA de este mes. Hazte Premium para seguir conversando con Presu.`
4. Si backend responde límite alcanzado, agregar ese mensaje al chat y no tratarlo como error técnico genérico.
5. Después de cada respuesta exitosa, actualizar el contador con `usage` retornado o llamar `refresh`.

### Guest

No agregar IA al modo invitado.

Mantener:

- `src/pages/guest/*`
- `src/components/guest/*`
- `src/context/GuestContext.tsx`

El hook `useAIUsageStatus` debe depender de usuario autenticado. Si no hay sesión, no consulta y no muestra cupos.

---

## UX y textos recomendados

### Escaneo con cupo disponible

```text
Tienes 1 de 2 escaneos gratuitos disponibles este mes.
```

### Escaneo bloqueado

```text
Llegaste al límite gratuito de 2 escaneos este mes.
Hazte Premium para seguir escaneando cartolas con IA.
```

### Chatbot con cupo disponible

```text
Respuestas IA: 4/10 usadas este mes.
```

### Chatbot bloqueado

```text
Llegaste al límite gratuito de 10 respuestas IA este mes.
Hazte Premium para seguir conversando con Presu.
```

### Premium

```text
IA incluida en Premium.
```

---

## Tareas de implementación

### Fase 1 — Base de datos

- [ ] Crear enum `ai_usage_feature`.
- [ ] Crear tabla `ai_usage_monthly`.
- [ ] Agregar índices y constraint única.
- [ ] Actualizar `src/database/schema/index.ts`.
- [ ] Ejecutar/generar migración Drizzle.
- [ ] Verificar migración en base local.

### Fase 2 — Servicio de cupos backend

- [ ] Crear `AIUsageModule`.
- [ ] Crear `AIUsageService`.
- [ ] Definir `AI_USAGE_LIMITS`.
- [ ] Implementar `getCurrentPeriodMonth`.
- [ ] Implementar `getStatusForUser(userId)`.
- [ ] Implementar `reserveUsage(userId, feature, isPremium)`.
- [ ] Implementar `refundUsage(userId, feature, periodMonth)`.
- [ ] Crear excepción/DTO para `AI_USAGE_LIMIT_REACHED`.
- [ ] Agregar `GET /ai-usage/status`.
- [ ] Importar `AIUsageModule` en `AppModule`.

### Fase 3 — Integración escaneo

- [ ] Inyectar `AIUsageService` en `AIService`.
- [ ] Reemplazar bloqueo premium por límite gratuito mensual.
- [ ] Reservar `statement_scan` antes de llamar OpenAI.
- [ ] Devolver reserva si falla OpenAI/parsing.
- [ ] Retornar `usage` en respuesta exitosa.
- [ ] Actualizar tipos del frontend para `aiApi.processStatement`.

### Fase 4 — Integración chatbot

- [ ] Inyectar `AIUsageService` en `ChatbotService`.
- [ ] Validar input y pertenencia a pareja antes de reservar.
- [ ] Reservar `chatbot_response` antes de llamar Gemini.
- [ ] Devolver reserva si falla Gemini.
- [ ] Retornar `usage` junto a `response`.
- [ ] Actualizar `ChatbotResponse` en frontend.

### Fase 5 — Frontend de cupos

- [ ] Crear `ai-usage.api.ts`.
- [ ] Crear tipos `aiUsage.ts`.
- [ ] Crear `useAIUsageStatus`.
- [ ] Integrar contador en `ScanButton`.
- [ ] Integrar contador y bloqueo en `ScanStatement`.
- [ ] Integrar contador y bloqueo en `AssistantChat`.
- [ ] Manejar `AI_USAGE_LIMIT_REACHED` como estado de negocio, no como error técnico.
- [ ] Confirmar que guest no consulta ni muestra cupos.

### Fase 6 — QA y tests

- [ ] Backend: usuario free con 0/2 escaneos puede procesar.
- [ ] Backend: usuario free con 2/2 escaneos recibe `AI_USAGE_LIMIT_REACHED`.
- [ ] Backend: usuario premium no incrementa cupo y puede procesar.
- [ ] Backend: fallo de proveedor devuelve reserva.
- [ ] Backend: chatbot free consume 1 cupo por respuesta.
- [ ] Backend: chatbot con mensaje sospechoso no consume cupo.
- [ ] Frontend: `/scan` deja entrar a free con cupo.
- [ ] Frontend: `/scan` bloquea free sin cupo.
- [ ] Frontend: chatbot deshabilita input sin cupo.
- [ ] Frontend: guest mode no ofrece IA ni cupos.
- [ ] Ejecutar `npm run build` en `presupuestados-back`.
- [ ] Ejecutar `npm run build` en `presupuestados-web`.

---

## Consideraciones de seguridad y abuso

- La validación real debe vivir en backend.
- No confiar en contadores del frontend.
- Usar operación atómica para evitar doble consumo concurrente.
- Mantener `AuthGuard` en endpoints de IA y de uso.
- No exponer detalles internos de proveedor IA en errores de usuario.
- Registrar logs internos para límites alcanzados y fallos de proveedor.

---

## Rollout recomendado

1. Deploy backend con tabla y endpoint de estado.
2. Deploy backend con límites activos en escaneo y chatbot.
3. Deploy frontend con contadores y bloqueo.
4. Monitorear durante 1 semana:
   - usuarios que llegan a 2/2 escaneos;
   - usuarios que llegan a 10/10 respuestas;
   - errores de `AI_USAGE_LIMIT_REACHED`;
   - costos OpenAI/Gemini;
   - conversión a premium después del bloqueo.
5. Ajustar el límite del chatbot si la conversión o costo lo justifica.

---

## Métricas recomendadas

Agregar eventos o logs estructurados:

- `ai_usage_reserved`
- `ai_usage_refunded`
- `ai_usage_limit_reached`
- `statement_scan_completed`
- `chatbot_response_completed`
- `premium_cta_shown_after_ai_limit`

Dimensiones mínimas:

- `userId`
- `feature`
- `periodMonth`
- `used`
- `limit`
- `isPremium`

---

## Fuera de alcance para esta primera versión

- Cupos para guest.
- Compra real de premium o integración con pagos.
- Límites diarios.
- Límites por pareja en vez de por usuario.
- Rate limiting anti-spam por IP.
- Panel admin para editar cupos.

---

## Recomendación final

Implementar primero:

- `2` escaneos gratis al mes.
- `10` respuestas de chatbot gratis al mes.
- Premium sin bloqueo por cupo.
- Guest sin acceso a IA.

Esta combinación deja probar valor real sin regalar demasiado costo variable. Si el chatbot se vuelve caro o muy usado, bajar a `5` respuestas mensuales es el ajuste más simple; si convierte bien a premium, mantener `10`.
