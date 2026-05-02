# Auditoría de seguridad backend y plan de remediación

Fecha: 2026-05-02  
Repositorio: `presupuestados-back`

---

## 0. Estado tras optimizaciones recientes

Actualizado tras los cambios de rendimiento y UX realizados el 2026-05-02.

Ya implementado:

- `GET /dashboard` ahora recibe `month` y `year` y filtra gastos candidatos en base de datos antes de aplicar la lógica final de recurrencias en TypeScript.
- `GET /dashboard/summary` reutiliza el mismo filtrado mensual de gastos y ya no trae todo el histórico de la pareja.
- Se agregó `GET /dashboard/bootstrap?month&year` para concentrar la carga inicial autenticada: usuario, perfil mínimo, pareja, miembros, ingresos, deducciones, presupuestos y gastos del mes.
- Las respuestas del dashboard usan `select` explícito para evitar columnas innecesarias como `owner_id` y `created_at` en la carga del home.
- El frontend consume `dashboard/bootstrap` para evitar llamadas separadas a `profiles/me`, `dashboard` y `couples/me` durante el arranque normal.
- Las categorías se cachean en el frontend por 24 horas y el backend envía `Cache-Control: private, max-age=86400`.
- El cambio de mes en el home muestra skeleton de contenido para evitar parpadeo de datos del mes anterior.

Pendiente:

- Los hallazgos críticos de autorización de gastos, recurrentes, IDs relacionados e invitaciones siguen pendientes salvo que se indique lo contrario en este documento.
- El endpoint `auth/me` queda como fallback para casos donde `dashboard/bootstrap` no puede cargar por razones distintas a token inválido, por ejemplo usuarios sin pareja inicializada.

---

## 1. Criterio de seguridad correcto

La regla de producto es:

- Una pareja comparte una misma planilla financiera.
- Ambos integrantes de la pareja pueden ver, crear, editar y eliminar los gastos de esa planilla.
- El límite de autorización no es `owner_id`.
- El límite de autorización es `couple_id`.

Por lo tanto, el backend debe permitir:

- Usuario A de la pareja X modifica gastos creados por usuario B de la misma pareja X.
- Usuario B de la pareja X modifica gastos creados por usuario A de la misma pareja X.

Y debe bloquear siempre:

- Usuario de la pareja X modifica gastos, ingresos, deducciones, presupuestos o invitaciones de la pareja Y.
- Usuario autenticado usa IDs de `family_members`, `budgets`, `expenses`, `incomes` o `deductions` que pertenecen a otra pareja.
- Usuario acepta invitaciones que no están dirigidas a su email.

Esto es especialmente importante porque el backend usa Service Role / acceso directo a DB. En ese modelo, RLS no es la barrera principal: toda la autorización debe estar validada explícitamente en los services de NestJS.

---

## 2. Hallazgos principales

### 2.1 `PUT /expenses/:id` puede modificar gastos de otra pareja

Ubicación:

- `src/expenses/expenses.controller.ts`
- `src/expenses/expenses.service.ts`

Problema:

El controller no calcula el `coupleId` del usuario autenticado para `updateExpense`. El service actualiza por `expenses.id` solamente:

```ts
.where(eq(expenses.id, updateExpenseDto.p_expense_id))
```

Impacto:

Si un usuario autenticado conoce o adivina un UUID válido de gasto de otra pareja, puede modificarlo. No necesita ser el `owner_id` del gasto ni pertenecer a esa pareja.

Comportamiento deseado:

Actualizar solo cuando:

- El usuario autenticado pertenece a una pareja.
- El gasto existe.
- `expense.couple_id === profile.couple_id` del usuario autenticado.

La validación debe ser por `coupleId`, no por `ownerId`, para permitir edición compartida dentro de la pareja.

---

### 2.2 Edición de gastos recurrentes no valida pertenencia a pareja

Ubicación:

- `src/expenses/expenses.controller.ts`
- `src/expenses/expenses.service.ts`

Problema:

`updateRecurringExpense` busca el gasto original solo por ID:

```ts
.where(eq(expenses.id, oldExpenseId))
```

Luego cierra el ciclo del gasto original por ID y crea un nuevo gasto usando `currentExpense.coupleId`.

Impacto:

Un usuario autenticado podría cerrar/modificar un gasto recurrente de otra pareja si conoce el ID. Además, el nuevo registro quedaría asociado al `coupleId` de la víctima, pero con `ownerId` del atacante.

Comportamiento deseado:

La edición recurrente debe recibir `coupleId` desde el controller y validar:

- El gasto original pertenece a ese `coupleId`.
- Los nuevos `paidBy`, `assignedUserId` y `budgetId` pertenecen al mismo `coupleId`.
- El cambio histórico mantiene la regla de negocio: cerrar el gasto viejo con `recurrenceEndDate` e insertar un nuevo gasto activo.

---

### 2.3 IDs relacionados no se validan contra la pareja actual

Ubicación:

- `src/expenses/expenses.service.ts`
- `src/incomes/incomes.service.ts`
- `src/deductions/deductions.service.ts`
- `src/budgets/budgets.service.ts`

Problema:

Varios endpoints aceptan IDs enviados por el cliente y los insertan/actualizan sin verificar que pertenezcan a la pareja autenticada:

- `p_paid_by`
- `p_assigned_user_id`
- `p_budget_id`
- `user_id`

Impacto:

Un usuario podría crear datos en su pareja que referencian miembros o presupuestos de otra pareja, o mover registros a relaciones inválidas. Aunque algunas FK de DB impidan IDs inexistentes, no impiden IDs existentes de otra pareja.

Comportamiento deseado:

Antes de cualquier insert/update:

- `paid_by` debe existir en `family_members` y tener el mismo `couple_id`.
- `assigned_user_id`, si viene, debe existir en `family_members` y tener el mismo `couple_id`.
- `budget_id`, si viene, debe existir en `budgets` y tener el mismo `couple_id`.
- `user_id` en incomes/deductions/budgets individuales debe ser `family_members.id` de la misma pareja.

---

### 2.4 Aceptación de invitaciones sin validar receptor

Ubicación:

- `src/partner-requests/partner-requests.service.ts`

Problema:

`acceptInvite(userId, requestId)` busca una invitación pendiente por ID, pero no valida que esa invitación esté dirigida al email del usuario autenticado.

Impacto:

Si un usuario obtiene el UUID de una invitación pendiente dirigida a otra persona, puede aceptarla y vincularse a la pareja del remitente.

Comportamiento deseado:

`acceptInvite` debe recibir `userId` y `userEmail`, y validar:

- `partner_requests.id === requestId`
- `status === 'pending'`
- `receiver_email === userEmail`
- `receiver_id IS NULL` o `receiver_id === userId`

---

### 2.5 `.env` no está protegido por `.gitignore`

Ubicación:

- `.gitignore`
- `.env`

Problema:

`.gitignore` actualmente ignora solo `node_modules`. El archivo `.env` existe localmente y contiene secretos potenciales como:

- `SUPABASE_SERVICE_KEY`
- `DATABASE_URL`
- `GEMINI_API_KEY`

Impacto:

Riesgo alto de commitear credenciales reales. La `SUPABASE_SERVICE_KEY` es especialmente crítica porque permite bypass de RLS.

Comportamiento deseado:

Agregar al `.gitignore`:

```gitignore
.env
.env.*
!.env.example
dist
.DS_Store
.idea
.claude
```

Si `.env` ya fue commiteado alguna vez, rotar inmediatamente las credenciales afectadas.

---

### 2.6 `redirect_to` abierto en recuperación de contraseña

Ubicación:

- `src/auth/dto/forgot-password.dto.ts`
- `src/auth/auth.service.ts`

Problema:

El cliente puede enviar cualquier `redirect_to`, y el backend lo pasa directo a Supabase:

```ts
redirectTo: dto.redirect_to;
```

Impacto:

Puede facilitar phishing o redirecciones no deseadas en flujos de recuperación si Supabase no está suficientemente restringido o si la configuración cambia.

Comportamiento deseado:

Definir una allowlist de orígenes permitidos:

- `FRONTEND_URL`
- opcionalmente `ADDITIONAL_AUTH_REDIRECT_ORIGINS`

Y rechazar cualquier `redirect_to` que no pertenezca a esa lista.

---

### 2.7 Upload a IA sin límites de tamaño ni MIME type

Ubicación:

- `src/ai/ai.controller.ts`
- `src/ai/ai.service.ts`

Problema:

`FileInterceptor('file')` no define `limits` ni `fileFilter`.

Impacto:

Usuarios premium podrían enviar archivos demasiado grandes o tipos inesperados, generando consumo excesivo de memoria, costo innecesario en Gemini o errores difíciles de controlar.

Comportamiento deseado:

Restringir:

- Tamaño máximo, por ejemplo 10 MB.
- MIME types permitidos: `application/pdf`, `image/png`, `image/jpeg`, `image/webp`.
- Respuestas claras para archivo inválido.

---

### 2.8 Swagger expuesto siempre

Ubicación:

- `src/main.ts`

Problema:

Swagger se monta siempre en `/api`, sin condición por ambiente.

Impacto:

Expone documentación completa de endpoints en producción. No es una vulnerabilidad crítica por sí sola, pero reduce fricción para atacar la API.

Comportamiento deseado:

Montar Swagger solo si:

- `NODE_ENV !== 'production'`, o
- `ENABLE_SWAGGER=true`, idealmente protegido por auth básica o red privada.

---

### 2.9 Dependencias con vulnerabilidades

Comando ejecutado:

```bash
npm audit --audit-level=moderate --json
```

Resultado:

- 24 vulnerabilidades totales.
- 2 críticas.
- 9 altas.
- 13 moderadas.

Paquetes destacados:

- `drizzle-orm <0.45.2`
- `@nestjs/core`
- `@nestjs/platform-express`
- `@nestjs/config`
- `@nestjs/swagger`
- `lodash`
- `path-to-regexp`
- `protobufjs`
- `handlebars`

Comportamiento deseado:

Actualizar dentro de rangos compatibles primero:

```bash
npm update
npm audit
```

Luego revisar fixes que impliquen cambios mayores, especialmente `drizzle-kit`.

---

## 3. Plan de remediación

### Fase 1: Bloquear cruces entre parejas

Objetivo:

Garantizar que todas las operaciones financieras se autorizan por `coupleId`.

Cambios propuestos:

1. Cambiar `ExpensesController.updateExpense` para obtener `coupleId` con `CoupleContextService`.
2. Cambiar `ExpensesService.updateExpense(coupleId, dto)` para actualizar con:

```ts
.where(and(
  eq(expenses.id, dto.p_expense_id),
  eq(expenses.coupleId, coupleId),
))
```

3. Cambiar `ExpensesController.updateRecurringExpense` para obtener `coupleId`.
4. Cambiar `ExpensesService.updateRecurringExpense(coupleId, ownerId, dto)` para buscar y cerrar el gasto viejo usando `id + coupleId`.
5. Devolver `NotFoundException` cuando el recurso no exista o no pertenezca a la pareja.

Criterios de aceptación:

- Pareja A puede modificar cualquier gasto de pareja A.
- Pareja A no puede modificar gasto de pareja B.
- Pareja A no puede editar recurrentes de pareja B.
- Las respuestas no revelan si el ID existe en otra pareja.

---

### Fase 2: Validar IDs relacionados

Objetivo:

Evitar referencias cruzadas entre parejas.

Cambios propuestos:

Crear helpers en un service compartido, por ejemplo `FinancialAccessService` o extender `CoupleContextService`:

```ts
assertFamilyMemberBelongsToCouple(coupleId: string, familyMemberId: string): Promise<void>
assertOptionalFamilyMemberBelongsToCouple(coupleId: string, familyMemberId?: string | null): Promise<void>
assertBudgetBelongsToCouple(coupleId: string, budgetId?: string | null): Promise<void>
```

Aplicar estos helpers en:

- `ExpensesService.addExpense`
- `ExpensesService.updateExpense`
- `ExpensesService.updateRecurringExpense`
- `IncomesService.createIncome`
- `IncomesService.updateIncome`
- `DeductionsService.createDeduction`
- `DeductionsService.updateDeduction`
- `BudgetsService.createBudget`
- `BudgetsService.updateBudget`

Criterios de aceptación:

- No se puede crear un gasto con `paid_by` de otra pareja.
- No se puede crear un gasto individual con `assigned_user_id` de otra pareja.
- No se puede asociar un gasto a un `budget_id` de otra pareja.
- No se puede crear ingreso/deducción para un `family_member` de otra pareja.
- Presupuestos individuales solo aceptan `user_id` de la misma pareja.

---

### Fase 3: Proteger invitaciones de pareja

Objetivo:

Impedir que una invitación sea aceptada por una cuenta distinta al receptor.

Cambios propuestos:

1. Cambiar controller:

```ts
return this.partnerRequestsService.acceptInvite(
  req.user.id,
  req.user.email,
  id,
);
```

2. Cambiar query de aceptación:

```ts
.where(and(
  eq(partnerRequests.id, requestId),
  eq(partnerRequests.status, 'pending'),
  eq(partnerRequests.receiverEmail, userEmail),
))
```

3. Normalizar emails a lowercase al enviar y al comparar.
4. Opcional: guardar `receiver_id` si el perfil ya existe al enviar invitación.
5. Usar transacción para actualizar profile, request y family_members de forma atómica.

Criterios de aceptación:

- Solo el email invitado puede aceptar.
- Una invitación ya aceptada no puede reutilizarse.
- Un usuario no puede aceptarse a sí mismo ni forzar vinculación por UUID ajeno.

---

### Fase 4: Endurecer configuración y secretos

Objetivo:

Reducir riesgo operacional.

Cambios propuestos:

1. Ampliar `.gitignore`.
2. Mantener `.env.example` como única plantilla versionable.
3. Agregar validación de env vars al arranque.
4. Considerar separación de variables:

```env
FRONTEND_URL=http://localhost:5173
ENABLE_SWAGGER=false
MAX_AI_UPLOAD_MB=10
```

5. Rotar credenciales si `.env` fue commiteado alguna vez.

Criterios de aceptación:

- `git check-ignore .env` confirma que `.env` está ignorado.
- El backend falla rápido si faltan variables obligatorias.
- Swagger no se expone accidentalmente en producción.

---

### Fase 5: Validar redirects y uploads

Objetivo:

Cerrar abusos en endpoints auxiliares.

Cambios propuestos:

1. Validar `redirect_to` contra allowlist.
2. Definir default seguro si `redirect_to` no viene.
3. Agregar `limits.fileSize` en `FileInterceptor`.
4. Agregar `fileFilter` por MIME type.
5. No loggear contenido completo devuelto por Gemini si puede contener datos bancarios.

Criterios de aceptación:

- Redirects fuera del frontend permitido son rechazados.
- Uploads grandes son rechazados antes de procesarse.
- Uploads con MIME inesperado son rechazados.
- Errores de IA no exponen datos sensibles del documento.

---

### Fase 6: Dependencias y pruebas

Objetivo:

Eliminar vulnerabilidades conocidas y dejar cobertura mínima para autorización.

Cambios propuestos:

1. Ejecutar:

```bash
npm update
npm audit
npm test
```

2. Si quedan vulnerabilidades:

```bash
npm audit fix
```

3. Revisar manualmente cualquier fix con cambio mayor.
4. Agregar tests de autorización.

Tests mínimos sugeridos:

- `PUT /expenses/:id` permite editar gasto de la misma pareja aunque `ownerId` sea del otro miembro.
- `PUT /expenses/:id` rechaza gasto de otra pareja.
- `PUT /expenses/recurring/:id` rechaza recurrente de otra pareja.
- `POST /expenses` rechaza `paid_by` de otra pareja.
- `POST /expenses` rechaza `assigned_user_id` de otra pareja.
- `POST /incomes` rechaza `user_id` de otra pareja.
- `POST /deductions` rechaza `user_id` de otra pareja.
- `POST /partner-requests/:id/accept` rechaza usuario cuyo email no coincide con `receiver_email`.

---

## 4. Prioridad recomendada

1. `updateExpense` y `updateRecurringExpense` con autorización por `coupleId`.
2. Helpers de validación para `family_members` y `budgets`.
3. Validación estricta de aceptación de invitaciones.
4. `.gitignore` y rotación de secretos si aplica.
5. Restricción de `redirect_to`, uploads y Swagger.
6. Actualización de dependencias y tests de regresión.

Las optimizaciones de dashboard/bootstrap ya no deberían bloquear el trabajo de seguridad. A partir de este punto, la prioridad vuelve a ser cerrar cruces entre parejas y referencias externas de IDs.

---

## 5. Principio guía para futuras features

Cada endpoint protegido debe responder estas preguntas antes de escribir en DB:

1. ¿Cuál es el `userId` autenticado?
2. ¿Cuál es su `coupleId` actual?
3. ¿El recurso que se quiere leer/modificar pertenece a ese `coupleId`?
4. ¿Todos los IDs relacionados enviados por el cliente pertenecen también a ese `coupleId`?

Si una de esas respuestas no se puede demostrar con queries explícitas, el endpoint debe rechazar la operación.
