# Frontend Migration Guide — Supabase RPCs → NestJS REST API

Documento de referencia para migrar el frontend de llamadas directas a Supabase RPCs/SDK
al nuevo backend NestJS. Incluye todos los endpoints, modelos de request/response y
el mapa de migración por hook.

---

## 1. Configuración Base

### Base URL
```
http://localhost:3000   ← desarrollo
https://api.tudominio.com  ← producción
```

### Autenticación

Todos los endpoints protegidos requieren el header:
```
Authorization: Bearer <access_token>
```

El `access_token` se obtiene en login/register y se refresca con `/auth/refresh`.
**Ya no se usa el cliente de Supabase en el frontend** — ni para queries ni para auth.
Todos los flujos de autenticación (incluidos recuperación y cambio de contraseña) tienen endpoint propio en el backend.

### Cambio crítico: snake_case → camelCase

El SDK de Supabase devolvía los campos en **snake_case** (`couple_id`, `full_name`).
El nuevo backend devuelve los mismos campos en **camelCase** (`coupleId`, `fullName`).
Ver sección 2 para los tipos completos.

### Cambio crítico: amounts como string

Los campos numéricos (`amount`, `limit`) vienen como `string` desde Drizzle/PostgreSQL.
El frontend debe hacer `Number(expense.amount)` o `parseFloat(expense.amount)` donde sea necesario.

---

## 2. Modelos TypeScript

Pega estos tipos en el proyecto frontend (ej. `types/api.ts`).

### Entidades principales

```typescript
export interface Profile {
  id: string
  email: string | null
  coupleId: string | null
  createdAt: string           // ISO date string
  fullName: string | null
  avatarUrl: string | null
  phone: string | null
  hasSeenOnboarding: boolean | null
  isPremium: boolean | null
  defaultSplitMethod: string | null  // '50/50' | 'proportional' | 'individual'
}

export interface FamilyMember {
  id: string
  ownerId: string
  name: string
  createdAt: string
  coupleId: string | null
  linkedUserId: string | null
}

export interface Expense {
  id: string
  ownerId: string
  amount: string              // ⚠️ string — usar Number(amount) para cálculos
  date: string                // ISO date string
  description: string
  isRecurring: boolean | null
  recurrenceInterval: string | null   // 'monthly' | 'weekly' | 'yearly' | null
  splitMethod: string                 // '50/50' | 'proportional' | 'individual'
  paidBy: string              // family_member.id
  assignedUserId: string | null       // family_member.id
  budgetId: string | null
  createdAt: string
  coupleId: string | null
  recurrenceEndDate: string | null    // ISO date string
  batchId: string | null
  batchName: string | null
  isCredit: boolean | null
  categoryId: number | null           // 0 = sin categoría
}

export interface Income {
  id: string
  ownerId: string
  userId: string              // family_member.id
  amount: string              // ⚠️ string
  description: string | null
  date: string
  createdAt: string
  coupleId: string | null
}

export interface Deduction {
  id: string
  ownerId: string
  userId: string              // family_member.id
  amount: string              // ⚠️ string
  description: string | null
  date: string
  createdAt: string
  coupleId: string | null
}

export interface Budget {
  id: string
  ownerId: string
  name: string
  type: 'joint' | 'individual'
  limit: string               // ⚠️ string
  userId: string | null       // family_member.id (solo en individual)
  createdAt: string
  coupleId: string | null
  associatedCard: string | null
  defaultSplitMethod: string | null
}

export interface ExpenseCategory {
  id: number
  name: string
}

export interface PartnerRequest {
  id: string
  senderId: string
  receiverEmail: string
  receiverId: string | null
  status: 'pending' | 'accepted' | 'rejected'
  createdAt: string | null
  // Campos enriquecidos (solo en getPendingInvites)
  senderEmail?: string | null
  senderFullName?: string | null
}
```

### Respuestas de Auth

```typescript
export interface AuthSession {
  access_token: string
  refresh_token: string
  expires_in: number
  token_type: string
  user: {
    id: string
    email: string
  }
}

export interface InitializeUserResponse {
  message: string
  coupleId?: string
}
```

### Dashboard

```typescript
export interface DashboardData {
  members: FamilyMember[]
  incomes: Income[]
  deductions: Deduction[]
  budgets: Budget[]
  expenses: Expense[]
}
```

### AI / Statement

```typescript
export interface ProcessStatementResponse {
  batch_id: string
  batch_name: string
  count: number
  extracted: Expense[]
}
```

### Chatbot

```typescript
export interface ChatResponse {
  reply: string
}
```

---

## 3. Referencia de Endpoints

### 3.1 Auth — `/auth`

#### `POST /auth/register`
No requiere auth header.

**Request body:**
```json
{
  "email": "user@example.com",
  "password": "min6chars"
}
```

**Response `201`:** `AuthSession`

---

#### `POST /auth/login`
No requiere auth header.

**Request body:**
```json
{
  "email": "user@example.com",
  "password": "min6chars"
}
```

**Response `200`:** `AuthSession`

---

#### `POST /auth/refresh`
No requiere auth header.

**Request body:**
```json
{
  "refresh_token": "..."
}
```

**Response `200`:** `AuthSession`

---

#### `POST /auth/logout`
Requiere auth header.

**Request body:** vacío

**Response `200`:**
```json
{ "message": "Sesión cerrada correctamente" }
```

---

#### `POST /auth/initialize`
Requiere auth header. Llámalo justo después del primer login/registro.
Crea perfil, pareja y miembros familiares del usuario.

**Request body:**
```json
{
  "p_email": "user@example.com",
  "p_full_name": "Juan Pérez",
  "p_invite_code": "ABC123"    // opcional — si tiene código de pareja
}
```

**Response `201`:** `InitializeUserResponse`
```json
{
  "message": "Usuario inicializado y pareja creada",
  "coupleId": "uuid-de-la-pareja"
}
```

---

#### `POST /auth/forgot-password`
No requiere auth header. Envía email de recuperación de contraseña.
Siempre responde con éxito (no revela si el email está registrado).

**Request body:**
```json
{
  "email": "user@example.com",
  "redirect_to": "https://tuapp.com/reset-password"  // opcional
}
```

**Response `200`:**
```json
{ "message": "Si el email existe, recibirás un enlace de recuperación" }
```

---

#### `PUT /auth/update-password`
Requiere auth header con el **access_token de recuperación** extraído del hash de la URL.

Cuando el usuario hace clic en el enlace del email, Supabase redirige a tu app con:
```
https://tuapp.com/reset-password#access_token=TOKEN&type=recovery&...
```

El frontend debe parsear ese hash y usar ese token como Bearer para esta llamada.

**Cómo extraer el token de recuperación:**
```typescript
// En la página/ruta de reset-password, al montar el componente:
function parseHashParams(hash: string): Record<string, string> {
  return hash.replace('#', '').split('&').reduce((acc, pair) => {
    const [key, value] = pair.split('=')
    return { ...acc, [key]: decodeURIComponent(value) }
  }, {})
}

const params = parseHashParams(window.location.hash)
if (params.type === 'recovery' && params.access_token) {
  // Guardar en estado local para usar como Bearer
  setRecoveryToken(params.access_token)
}
```

**Request body:**
```json
{ "new_password": "nuevaContraseña123" }
```

**Headers:** `Authorization: Bearer <recovery_access_token>`

**Response `200`:**
```json
{ "message": "Contraseña actualizada correctamente" }
```

**Flujo completo de recuperación de contraseña:**
1. Usuario introduce email → `POST /auth/forgot-password`
2. Usuario recibe email y hace clic en el enlace
3. App detecta `#type=recovery` en la URL → extrae `access_token` del hash
4. Usuario introduce nueva contraseña → `PUT /auth/update-password` con recovery token
5. Redirigir al login

> **Nota:** Ya no se usa `supabase.auth.onAuthStateChange` para detectar el evento `PASSWORD_RECOVERY`.
> La detección se hace parseando `window.location.hash` directamente.

---

### 3.2 Perfil — `/profiles`

#### `GET /profiles/me`
Requiere auth header.

**Response `200`:**
```typescript
Profile & { family_members: FamilyMember[] }
// Notar: family_members en snake_case (campo extra, no del schema)
```

---

#### `PUT /profiles/me`
Requiere auth header. Todos los campos son opcionales.

**Request body:**
```json
{
  "full_name": "Juan Pérez",
  "avatar_url": "https://...",
  "phone": "+56912345678",
  "default_split_method": "50/50"
}
```

**Response `200`:** `Profile` actualizado

---

### 3.3 Pareja — `/couples`

#### `POST /couples/join`
Requiere auth header. Une al usuario a una pareja existente por código.

**Request body:**
```json
{
  "p_code": "ABC123"
}
```

**Response `201`:**
```json
{ "message": "Vinculación exitosa" }
```

---

#### `GET /couples/partner-email`
Requiere auth header.

**Response `200`:**
```json
{ "email": "partner@example.com" }
// o
{ "email": null }   // si el usuario no tiene pareja vinculada
```

---

### 3.4 Invitaciones de Pareja — `/partner-requests`

#### `POST /partner-requests`
Requiere auth header. Envía una invitación por email.

**Request body:**
```json
{
  "receiver_email": "partner@example.com"
}
```

**Response `201`:**
```json
{ "success": true }
```

**Errores posibles:**
- `400` — Ya existe una invitación pendiente para ese email
- `400` — No puedes enviarte una invitación a ti mismo

---

#### `GET /partner-requests/pending`
Requiere auth header. Lista invitaciones pendientes **recibidas** por el usuario.

**Response `200`:** `PartnerRequest[]`
```json
[
  {
    "id": "uuid",
    "senderId": "uuid",
    "receiverEmail": "yo@example.com",
    "receiverId": null,
    "status": "pending",
    "createdAt": "2024-01-01T...",
    "senderEmail": "partner@example.com",
    "senderFullName": "María García"
  }
]
```

---

#### `POST /partner-requests/:id/accept`
Requiere auth header. Acepta la invitación con ese ID.
Vincula al usuario a la pareja del sender y actualiza `family_members`.

**Params:** `:id` = `PartnerRequest.id`

**Response `201`:**
```json
{ "success": true }
```

---

### 3.5 Miembros del Hogar — `/family-members`

#### `GET /family-members`
Requiere auth header.

**Response `200`:** `FamilyMember[]`

> ⚠️ Los `id` de `FamilyMember` son los UUIDs que se usan como `paidBy` y `assignedUserId`
> en los gastos. No son los `auth.users.id`.

---

### 3.6 Gastos — `/expenses`

#### `GET /expenses`
Requiere auth header. Lista todos los gastos del hogar.

**Query params opcionales:**
```
?month=3&year=2024    // Filtra por mes y año (ambos o ninguno)
```

**Response `200`:** `Expense[]` ordenado por fecha descendente

---

#### `POST /expenses`
Requiere auth header.

**Request body:**
```json
{
  "p_expense_id": "uuid-generado-por-el-cliente",
  "p_amount": 15000,
  "p_date": "2024-03-15",
  "p_description": "Supermercado Jumbo",
  "p_split_method": "50/50",
  "p_paid_by": "family-member-uuid",
  "p_is_recurring": false,
  "p_recurrence_interval": null,
  "p_recurrence_end_date": null,
  "p_assigned_user_id": "family-member-uuid",
  "p_budget_id": "budget-uuid-o-null",
  "p_batch_id": null,
  "p_batch_name": null,
  "p_is_credit": false,
  "p_category_id": 1
}
```

> El cliente genera el UUID del gasto (`p_expense_id`). Usa `crypto.randomUUID()` o `uuid`.

**Response `201`:** `Expense` creado

---

#### `PUT /expenses/:id`
Requiere auth header. Misma estructura que POST.

**Params:** `:id` = `Expense.id`

**Request body:** igual que `POST /expenses` (todos los campos)

**Response `200`:** `Expense` actualizado

---

#### `PUT /expenses/recurring/:id`
Requiere auth header. Divide un gasto recurrente en dos a partir de una fecha de corte.
El gasto original queda con `recurrenceEndDate` en el último día del mes anterior al nuevo inicio.
El nuevo gasto siempre se crea con `recurrenceEndDate = null`.
`p_cutoff_date` se mantiene solo por compatibilidad y el backend puede derivarlo desde `p_new_expense.p_date`.

**Params:** `:id` = `Expense.id` del gasto original

**Request body:**
```json
{
  "p_old_expense_id": "uuid-gasto-original",
  "p_cutoff_date": "2024-03-31",
  "p_new_expense": {
    "p_expense_id": "nuevo-uuid",
    "p_amount": 18000,
    "p_date": "2024-04-01",
    "p_description": "Supermercado Jumbo",
    "p_split_method": "50/50",
    "p_paid_by": "family-member-uuid",
    "p_is_recurring": true,
    "p_recurrence_interval": "monthly",
    "p_recurrence_end_date": null,
    "p_assigned_user_id": "family-member-uuid",
    "p_budget_id": null,
    "p_batch_id": null,
    "p_batch_name": null,
    "p_is_credit": false,
    "p_category_id": 1
  }
}
```

**Response `200`:** `Expense` nuevo insertado

---

#### `PUT /expenses/recurring/:id/stop`
Requiere auth header. Asigna `recurrenceEndDate` al gasto para detener la recurrencia.

**Params:** `:id` = `Expense.id`

**Request body:**
```json
{
  "p_expense_id": "uuid-del-gasto",
  "p_end_date": "2024-03-31"
}
```

**Response `200`:** `Expense` actualizado

---

#### `DELETE /expenses/batch`
Requiere auth header. Elimina múltiples gastos en lote.

**Request body:**
```json
{
  "p_expense_ids": ["uuid1", "uuid2", "uuid3"]
}
```

**Response `200`:**
```json
{ "deleted": 3 }
```

---

#### `DELETE /expenses/:id`
Requiere auth header.

**Params:** `:id` = `Expense.id`

**Response `200`:**
```json
{ "deleted": true, "id": "uuid" }
```

---

### 3.7 Ingresos — `/incomes`

> ⚠️ Cambio de API: el antiguo `sync_incomes` (reemplaza todo) ya no existe.
> Ahora son operaciones CRUD individuales. Ver sección 5 para el patrón de migración.

#### `GET /incomes`
Requiere auth header.

**Response `200`:** `Income[]`

---

#### `POST /incomes`
Requiere auth header.

**Request body:**
```json
{
  "id": "uuid-opcional",
  "user_id": "family-member-uuid",
  "amount": 850000,
  "description": "Sueldo marzo",
  "date": "2024-03-01"
}
```

**Response `201`:** `Income` creado

---

#### `PUT /incomes/:id`
Requiere auth header. Todos los campos son opcionales.

**Params:** `:id` = `Income.id`

**Request body:**
```json
{
  "amount": 900000,
  "description": "Sueldo actualizado",
  "date": "2024-03-01",
  "user_id": "family-member-uuid"
}
```

**Response `200`:** `Income` actualizado

---

#### `DELETE /incomes/:id`
Requiere auth header.

**Params:** `:id` = `Income.id`

**Response `200`:**
```json
{ "deleted": true, "id": "uuid" }
```

---

### 3.8 Deducciones — `/deductions`

Misma estructura que `/incomes`.

#### `GET /deductions` → `Deduction[]`
#### `POST /deductions` → `Deduction`
**Body:** `{ id?, user_id, amount, description?, date }`

#### `PUT /deductions/:id` → `Deduction`
**Body:** `{ amount?, description?, date?, user_id? }`

#### `DELETE /deductions/:id` → `{ deleted: true, id }`

---

### 3.9 Presupuestos — `/budgets`

#### `GET /budgets`
Requiere auth header.

**Response `200`:** `Budget[]`

---

#### `GET /budgets/:id/summary?month=3&year=2024`
Requiere auth header. Calcula métricas de ejecución de un presupuesto para el mes indicado.

Incluye expansión de gastos recurrentes activos en el mes (`monthly`, `weekly`, `yearly`).
Replica la lógica de `useBudgetDetail` del frontend.

**Params:** `:id` = `Budget.id`

**Query params:**
```
month: number   // 1–12
year:  number   // >= 2000
```

**Response `200`:**
```typescript
interface BudgetSummary {
  budgetId: string
  name: string
  type: 'joint' | 'individual'
  limit: number
  totalSpent: number
  remaining: number           // max(0, limit - totalSpent)
  percentage: number          // 0–100, con 1 decimal
  dailyAverage: number        // totalSpent / días transcurridos del mes
  projectedSpend: number      // dailyAverage * días del mes
  expensesCount: number
}
```

**Ejemplo:**
```json
{
  "budgetId": "uuid",
  "name": "Supermercado",
  "type": "joint",
  "limit": 200000,
  "totalSpent": 145000,
  "remaining": 55000,
  "percentage": 72.5,
  "dailyAverage": 5357,
  "projectedSpend": 166067,
  "expensesCount": 8
}
```

**Colores de progreso sugeridos (igual que el frontend):**
- `< 75%` → verde
- `75–90%` → naranja
- `> 90%` → rojo

---

#### `POST /budgets`
Requiere auth header.

**Request body:**
```json
{
  "id": "uuid-opcional",
  "name": "Supermercado",
  "type": "joint",
  "limit": 200000,
  "user_id": null,
  "associated_card": "Visa",
  "default_split_method": "50/50"
}
```

> Para `type: "individual"`, `user_id` (family_member.id) es obligatorio.

**Response `201`:** `Budget` creado

---

#### `PUT /budgets/:id`
Requiere auth header. Todos los campos son opcionales.

**Params:** `:id` = `Budget.id`

**Request body:** mismos campos que POST (todos opcionales)

**Response `200`:** `Budget` actualizado

---

#### `DELETE /budgets/:id`
Requiere auth header. Elimina el presupuesto y desvincula sus gastos (`budgetId = null`).

**Params:** `:id` = `Budget.id`

**Response `200`:**
```json
{ "message": "Presupuesto eliminado" }
```

---

### 3.10 Categorías — `/categories`

#### `GET /categories`
Requiere auth header.

**Response `200`:** `ExpenseCategory[]`
```json
[
  { "id": 1, "name": "Supermercado" },
  { "id": 2, "name": "Restaurante" },
  ...
]
```

---

### 3.11 Dashboard — `/dashboard`

#### `GET /dashboard`
Requiere auth header. Retorna todos los datos del hogar en una sola llamada.

**Response `200`:** `DashboardData`
```json
{
  "members": [...],
  "incomes": [...],
  "deductions": [...],
  "budgets": [...],
  "expenses": [...]
}
```

---

#### `GET /dashboard/summary?month=3&year=2024`
Requiere auth header. Calcula el resumen financiero mensual del hogar.

Incluye expansión de gastos recurrentes (`monthly`, `weekly`, `yearly`).
Replica la lógica de `summaryService.calculateSummary` del frontend.

**Query params:**
```
month: number   // 1–12
year:  number   // >= 2000
```

**Response `200`:**
```typescript
interface DashboardSummary {
  users: Array<{
    memberId: string        // family_member.id
    name: string
    linkedUserId: string    // auth user id
    grossIncome: number     // suma de todos sus ingresos
    deductions: number      // suma de todas sus deducciones
    netIncome: number       // grossIncome - deductions
    shareOfJointExpenses: number  // su parte proporcional de gastos conjuntos del mes
    individualExpenses: number    // gastos individuales asignados a él (créditos restan)
    remainingIncome: number       // netIncome - shareOfJoint - individualExpenses
  }>
  totals: {
    totalJointExpenses: number   // suma de gastos no-individuales del mes
    totalExpenses: number        // suma total (créditos restan)
    totalNetIncome: number       // suma de netIncome de todos los miembros
  }
}
```

**Ejemplo:**
```json
{
  "users": [
    {
      "memberId": "uuid-member-1",
      "name": "Juan",
      "linkedUserId": "uuid-user-1",
      "grossIncome": 850000,
      "deductions": 50000,
      "netIncome": 800000,
      "shareOfJointExpenses": 420000,
      "individualExpenses": 35000,
      "remainingIncome": 345000
    },
    {
      "memberId": "uuid-member-2",
      "name": "María",
      "linkedUserId": "uuid-user-2",
      "grossIncome": 1200000,
      "deductions": 80000,
      "netIncome": 1120000,
      "shareOfJointExpenses": 580000,
      "individualExpenses": 20000,
      "remainingIncome": 520000
    }
  ],
  "totals": {
    "totalJointExpenses": 1000000,
    "totalExpenses": 1055000,
    "totalNetIncome": 1920000
  }
}
```

**Nota sobre splitMethod:**
- `50/50` — cada usuario paga la mitad del gasto
- `proportional` — cada usuario paga en proporción a su `netIncome`
- `individual` — no entra en `shareOfJointExpenses`, entra en `individualExpenses` del assignedUserId

---

### 3.12 Chatbot (Premium) — `/chatbot`

#### `POST /chatbot/chat`
Requiere auth header. El usuario debe ser premium (`isPremium = true`).

**Request body:**
```json
{
  "message": "¿Cuánto gasté en restaurantes este mes?"
}
```

**Response `200`:** `ChatResponse`
```json
{
  "reply": "Este mes has gastado $45.000 en restaurantes..."
}
```

---

### 3.13 IA / Extracto Bancario (Premium) — `/ai`

#### `POST /ai/process-statement`
Requiere auth header. El usuario debe ser premium (`isPremium = true`).
Enviar como `multipart/form-data`.

**Form fields:**
```
file: File          // PDF o imagen del extracto (requerido)
batch_name: string  // opcional — nombre para el lote
paid_by: string     // opcional — family_member.id (default: el usuario actual)
assigned_user_id: string  // opcional — family_member.id
```

**Response `200`:** `ProcessStatementResponse`
```json
{
  "batch_id": "uuid",
  "batch_name": "Importación automatizada 2024-03-15",
  "count": 12,
  "extracted": [...]   // Expense[]
}
```

---

## 4. Mapa de Migración: Hooks → Endpoints

### `useLogin`

| Acción anterior | Nuevo endpoint |
|---|---|
| `supabase.auth.signUp(email, password)` | `POST /auth/register` |
| `supabase.auth.signInWithPassword(email, password)` | `POST /auth/login` |
| `supabase.auth.refreshSession(refresh_token)` | `POST /auth/refresh` |
| `supabase.auth.signOut()` | `POST /auth/logout` |
| `supabase.auth.resetPasswordForEmail(email)` | `POST /auth/forgot-password` |
| `supabase.auth.onAuthStateChange` (PASSWORD_RECOVERY) | Parsear `window.location.hash` — ver sección 3.1 |
| `initialize_user_data(email, name, invite_code?)` | `POST /auth/initialize` |

---

### `useProfile`

| Acción anterior | Nuevo endpoint |
|---|---|
| `get_current_user_profile` | `GET /profiles/me` |
| `update_user_profile_rpc(full_name, phone, ...)` | `PUT /profiles/me` |
| `get_linked_partner_email_rpc` | `GET /couples/partner-email` |
| `get_pending_invites_rpc` | `GET /partner-requests/pending` |
| `send_partner_invite_rpc(receiver_email)` | `POST /partner-requests` |
| `accept_partner_invite_rpc(request_id)` | `POST /partner-requests/:id/accept` |
| `supabase.auth.updateUser({ password })` | `PUT /auth/update-password` |

**Nota:** `GET /profiles/me` devuelve el perfil con `family_members` embebidos. Ya incluye
`coupleId`, `inviteCode` debe obtenerse de `GET /couples` o de `initializeUserData`.

---

### `useSetup`

| Acción anterior | Nuevo endpoint |
|---|---|
| `get_family_members_rpc` | `GET /family-members` |
| `get_incomes_rpc` | `GET /incomes` |
| `get_deductions_rpc` | `GET /deductions` |
| `join_couple_by_code(code)` | `POST /couples/join` |
| `sync_incomes(userId, coupleId, items[])` | **Ver nota abajo** |
| `sync_deductions(userId, coupleId, items[])` | **Ver nota abajo** |

**⚠️ Migración sync → CRUD individual:**

El antiguo `sync_incomes` hacía un reemplazo total (delete + insert) en un solo RPC.
El nuevo backend expone CRUD individual. El frontend debe implementar la sincronización así:

```typescript
async function syncIncomes(
  localItems: Income[],
  remoteItems: Income[],
  api: ApiClient
) {
  // 1. Detectar eliminados
  const remoteIds = new Set(remoteItems.map(i => i.id))
  const localIds = new Set(localItems.map(i => i.id))
  const toDelete = remoteItems.filter(i => !localIds.has(i.id))
  const toCreate = localItems.filter(i => !remoteIds.has(i.id))
  const toUpdate = localItems.filter(i => remoteIds.has(i.id))

  await Promise.all([
    ...toDelete.map(i => api.delete(`/incomes/${i.id}`)),
    ...toCreate.map(i => api.post('/incomes', i)),
    ...toUpdate.map(i => api.put(`/incomes/${i.id}`, i)),
  ])
}
```

El mismo patrón aplica para `syncDeductions`.

---

### `useDashboard`

| Acción anterior | Nuevo endpoint |
|---|---|
| `get_dashboard_data(couple_id)` | `GET /dashboard` |
| `getSummaryForMonth(month, year)` → `summaryService.calculateSummary` | `GET /dashboard/summary?month=X&year=Y` ✨ |
| `add_expense_rpc(...)` | `POST /expenses` |
| `delete_expense_rpc(id)` | `DELETE /expenses/:id` |
| `delete_expenses_batch_rpc(ids[])` | `DELETE /expenses/batch` |
| `delete_budget_rpc(id)` | `DELETE /budgets/:id` |
| `stop_recurring_expense_rpc(id, end_date)` | `PUT /expenses/recurring/:id/stop` |

**Sobre `GET /dashboard/summary`:**
El backend calcula `netIncome`, `shareOfJointExpenses`, `remainingIncome` y totales.
La expansión de recurrentes también ocurre en el servidor — el frontend ya no lo necesita hacer.

**Sobre `GET /dashboard`:**
Sigue devolviendo todos los gastos sin filtro de mes. Úsalo para cargar los datos base.
Para el resumen financiero mensual usa `/dashboard/summary`.

---

### `useBudgetDetail`

| Acción anterior | Nuevo endpoint |
|---|---|
| Cálculo de `totalSpent`, `remaining`, `dailyAverage`, `projectedSpend`, `percentage` | `GET /budgets/:id/summary?month=X&year=Y` ✨ |
| `delete_expense_rpc(id)` | `DELETE /expenses/:id` |
| `delete_budget_rpc(id)` | `DELETE /budgets/:id` |
| `stop_recurring_expense_rpc(id, end_date)` | `PUT /expenses/recurring/:id/stop` |
| `add_expense_rpc(...)` | `POST /expenses` |

---

### `useHistory`

| Acción anterior | Nuevo endpoint |
|---|---|
| `delete_expense_rpc(id)` | `DELETE /expenses/:id` |

---

### `useForecast`

No invoca RPCs. Sin cambios.

---

### `useGeneralTab`

No invoca RPCs. Sin cambios.

---

### `useScanStatement`

| Acción anterior | Nuevo endpoint |
|---|---|
| Edge Function legacy (multipart) | `POST /ai/process-statement` |
| `supabase.from('expenses').insert(items[])` | `POST /expenses` (uno por uno, o usar batch_id) |

**Nota:** El nuevo endpoint `/ai/process-statement` ya inserta los gastos en la BD
automáticamente y devuelve los gastos creados. El frontend ya no necesita el segundo paso
de inserción manual.

---

## 5. Mapeo de campos snake_case → camelCase

Referencia rápida para actualizar el frontend:

| Campo anterior (Supabase) | Campo nuevo (backend) |
|---|---|
| `couple_id` | `coupleId` |
| `full_name` | `fullName` |
| `avatar_url` | `avatarUrl` |
| `is_premium` | `isPremium` |
| `has_seen_onboarding` | `hasSeenOnboarding` |
| `default_split_method` | `defaultSplitMethod` |
| `invite_code` | No expuesto directamente — viene de `initializeUserData` |
| `linked_user_id` | `linkedUserId` |
| `owner_id` | `ownerId` |
| `created_at` | `createdAt` |
| `is_recurring` | `isRecurring` |
| `recurrence_interval` | `recurrenceInterval` |
| `split_method` | `splitMethod` |
| `paid_by` | `paidBy` |
| `assigned_user_id` | `assignedUserId` |
| `budget_id` | `budgetId` |
| `recurrence_end_date` | `recurrenceEndDate` |
| `batch_id` | `batchId` |
| `batch_name` | `batchName` |
| `is_credit` | `isCredit` |
| `category_id` | `categoryId` |
| `associated_card` | `associatedCard` |
| `user_id` (en budgets) | `userId` |
| `sender_id` | `senderId` |
| `receiver_email` | `receiverEmail` |
| `receiver_id` | `receiverId` |

---

## 6. Cliente API Recomendado

```typescript
// lib/api-client.ts

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000'

async function request<T>(
  path: string,
  options: RequestInit & { token?: string } = {}
): Promise<T> {
  const { token, ...fetchOptions } = options

  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...fetchOptions.headers,
  }

  const res = await fetch(`${BASE_URL}${path}`, { ...fetchOptions, headers })

  if (!res.ok) {
    const error = await res.json().catch(() => ({ message: res.statusText }))
    throw new Error(error.message ?? `HTTP ${res.status}`)
  }

  return res.json() as Promise<T>
}

export const api = {
  get: <T>(path: string, token: string) =>
    request<T>(path, { method: 'GET', token }),

  post: <T>(path: string, body: unknown, token?: string) =>
    request<T>(path, {
      method: 'POST',
      body: JSON.stringify(body),
      token,
    }),

  put: <T>(path: string, body: unknown, token: string) =>
    request<T>(path, {
      method: 'PUT',
      body: JSON.stringify(body),
      token,
    }),

  delete: <T>(path: string, token: string, body?: unknown) =>
    request<T>(path, {
      method: 'DELETE',
      body: body ? JSON.stringify(body) : undefined,
      token,
    }),

  upload: <T>(path: string, formData: FormData, token: string) =>
    request<T>(path, {
      method: 'POST',
      body: formData,
      headers: { Authorization: `Bearer ${token}` },
      // No incluir Content-Type aquí — el browser lo setea automáticamente con el boundary
    }),
}
```

---

## 7. Errores Estándar

Todos los errores siguen el formato NestJS:

```json
{
  "statusCode": 400,
  "message": "Mensaje de error en español",
  "error": "Bad Request"
}
```

| HTTP Status | Causa |
|---|---|
| `400` | Validación fallida o lógica de negocio |
| `401` | Token ausente o inválido |
| `403` | Sin permiso (ej. no premium) |
| `404` | Recurso no encontrado |
| `500` | Error interno del servidor |

---

## 8. Cosas que NO cambian en el Frontend

Los siguientes hooks/lógicas son **solo cálculos en memoria** sobre datos ya descargados.
No invocan ningún endpoint y no requieren cambios:

- `useGeneralTab` — filtros y ordenamiento en tiempo real
- `useHistory` — agrupación de gastos por mes
- `useForecast` — proyección de 6 meses sobre datos en memoria
- `getUserShare(expense, userId)` — función pura de cálculo por gasto

### Lógicas que se pueden simplificar (opcional)

Con los nuevos endpoints de cálculo, el frontend puede optar por:

| Lógica actual | Alternativa |
|---|---|
| `summaryService.calculateSummary` | Reemplazar por `GET /dashboard/summary` — el backend devuelve el mismo resultado |
| Cálculo de `remaining`, `dailyAverage`, `projectedSpend` en `useBudgetDetail` | Reemplazar por `GET /budgets/:id/summary` |

Si el frontend ya tiene estos cálculos funcionando bien, **no es obligatorio migrarlos**.
El beneficio principal es DRY entre clientes (web + futuro móvil).
