# Hooks y RPCs — Presupuestados

Documento de referencia que describe cada hook de la aplicación, los cálculos que realiza, los datos que consume y los RPCs de Supabase que se invocan.

---

## Índice de RPCs

| RPC / Endpoint                 | Servicio | Operación                                                     |
| ------------------------------ | -------- | ------------------------------------------------------------- |
| `get_couple_id_rpc`            | auth     | Obtiene el `couple_id` del usuario actual                     |
| `get_family_members_rpc`       | auth     | Obtiene los miembros del hogar/pareja                         |
| `initialize_user_data`         | auth     | Inicializa datos del usuario al primer login                  |
| `get_current_user_profile`     | auth     | Obtiene el perfil completo del usuario actual                 |
| `update_user_profile_rpc`      | auth     | Actualiza nombre, teléfono, método de división por defecto    |
| `get_household_ids_rpc`        | auth     | Obtiene todos los `user_id` del hogar                         |
| `get_linked_partner_email_rpc` | auth     | Obtiene el email del partner vinculado                        |
| `send_partner_invite_rpc`      | auth     | Envía invitación al partner por email                         |
| `get_pending_invites_rpc`      | auth     | Lista invitaciones pendientes recibidas                       |
| `accept_partner_invite_rpc`    | auth     | Acepta una invitación de pareja                               |
| `join_couple_by_code`          | auth     | Une dos usuarios en pareja usando un código                   |
| `get_budgets_rpc`              | budget   | Lista todos los presupuestos del hogar                        |
| `create_budget_rpc`            | budget   | Crea un presupuesto nuevo                                     |
| `update_budget_rpc`            | budget   | Actualiza nombre, límite, tipo de un presupuesto              |
| `delete_budget_rpc`            | budget   | Elimina presupuesto y desvincula sus gastos (atómico)         |
| `add_expense_rpc`              | expense  | Crea un gasto con validación de presupuesto                   |
| `update_expense_rpc`           | expense  | Actualiza un gasto existente                                  |
| `split_recurring_expense_rpc`  | expense  | Divide un gasto recurrente en dos a partir de una fecha       |
| `delete_expense_rpc`           | expense  | Elimina un gasto individual                                   |
| `delete_expenses_batch_rpc`    | expense  | Elimina múltiples gastos en lote                              |
| `stop_recurring_expense_rpc`   | expense  | Detiene una recurrencia asignándole fecha de fin              |
| `get_incomes_rpc`              | income   | Lista ingresos del hogar                                      |
| `get_deductions_rpc`           | income   | Lista deducciones del hogar                                   |
| `sync_incomes`                 | income   | Reemplaza/sincroniza los ingresos del usuario                 |
| `sync_deductions`              | income   | Reemplaza/sincroniza las deducciones del usuario              |
| `get_categories_rpc`           | category | Lista categorías de gastos disponibles                        |
| `expenses` (tabla directa)     | expense  | Lectura de todos los gastos del hogar (ordenados por fecha)   |
| `gemini-ai` (Edge Function)    | expense  | Parsea un extracto bancario con IA y retorna gastos extraídos |

---

## Hooks

### `useDashboard`

**Pantalla:** Dashboard principal

**Datos consumidos del contexto (`FinanceContext`):**

- `users` — miembros del hogar
- `expenses` — todos los gastos (se filtran en el hook)
- `budgets` — presupuestos del hogar
- `getSummaryForMonth` — función del contexto que delega en `summaryService`
- `isLoading`

**Cálculos principales:**

| Valor                           | Descripción                                                                                                               |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `monthlyExpenses`               | Gastos del mes seleccionado; expande recurrencias mensuales/semanales/anuales al mes correcto y respeta `recurrenceEndDate` |
| `jointExpenses`                 | Subset de `monthlyExpenses` donde `splitMethod !== 'individual'`                                                          |
| `individualExpenses`            | Subset de `monthlyExpenses` donde `splitMethod === 'individual'`                                                          |
| `budgetedJointExpenses`         | Gastos conjuntos que tienen `budgetId`                                                                                    |
| `unbudgetedJointExpenses`       | Gastos conjuntos sin `budgetId`                                                                                           |
| `totalBudgetedSpent`            | Suma de `amount` de `budgetedJointExpenses`                                                                               |
| `totalJointBudgetLimit`         | Suma de `limit` de todos los presupuestos de tipo `joint`                                                                 |
| `totalNetIncome`                | Suma de `netIncome` de todos los usuarios (desde `summary`)                                                               |
| `totalJointAmount`              | Suma total de todos los gastos conjuntos del mes                                                                          |
| `userJointTotals`               | Por usuario: su parte proporcional del total de gastos conjuntos                                                          |
| `userBudgetedTotals`            | Por usuario: su parte proporcional de los gastos conjuntos presupuestados                                                 |
| `getUserShare(expense, userId)` | Calcula la parte de un gasto para un usuario según `splitMethod` (50/50, proporcional al ingreso neto, o 0 si individual) |
| `summary`                       | Resumen financiero completo del mes (via `getSummaryForMonth`)                                                            |
| `getInitialExpenseDate`         | Fecha inicial para el diálogo de nuevo gasto (hoy si es el mes actual, o día 1 del mes seleccionado)                      |

**Acciones que invocan RPCs (a través del contexto):**

- `addExpense` → `add_expense_rpc`
- `deleteExpense` → `delete_expense_rpc`
- `deleteExpenses` → `delete_expenses_batch_rpc`
- `removeBudget` → `delete_budget_rpc`
- `stopRecurringExpense` → `stop_recurring_expense_rpc`

---

### `useBudgetDetail`

**Pantalla:** Detalle de un presupuesto individual

**Datos consumidos del contexto:**

- `budgets`, `expenses`, `users`

**Cálculos principales:**

| Valor            | Descripción                                                                                                                 |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `budgetExpenses` | Gastos del presupuesto activo en el mes seleccionado; incluye recurrentes que aún no han terminado                          |
| `totalSpent`     | Suma de `amount` de `budgetExpenses`                                                                                        |
| `remaining`      | `budget.limit - totalSpent` (mínimo 0)                                                                                      |
| `percentage`     | `(totalSpent / budget.limit) * 100` (máximo 100)                                                                            |
| `dailyAverage`   | `totalSpent / daysPassed` donde `daysPassed` es el día actual si es el mes presente, o el total de días si es un mes pasado |
| `projectedSpend` | `dailyAverage * daysInMonth` — proyección del gasto al final del mes                                                        |
| `progressColor`  | Verde (<75 %), naranja (75–90 %), rojo (>90 %)                                                                              |

**Acciones que invocan RPCs:**

- `deleteExpense` → `delete_expense_rpc`
- `removeBudget` → `delete_budget_rpc`
- `stopRecurringExpense` → `stop_recurring_expense_rpc`
- `addExpense` → `add_expense_rpc` (al registrar ahorro)

**Lógica especial — eliminación de recurrentes:**
Al eliminar un gasto recurrente en un mes posterior a su inicio, en lugar de borrarlo invoca `stop_recurring_expense_rpc` con la fecha del último día del mes anterior al visualizado.

---

### `useGeneralTab`

**Pantalla:** Pestaña "General" dentro del Dashboard

**Datos recibidos como props (ya calculados por `useDashboard`):**

- `unbudgetedJointExpenses`
- `individualExpenses`
- `users`
- `getUserShare`

**Cálculos principales:**

| Valor                        | Descripción                                                                                         |
| ---------------------------- | --------------------------------------------------------------------------------------------------- |
| `filteredJointExpenses`      | Gastos conjuntos no presupuestados aplicando filtros (búsqueda, rango de monto, método de división) |
| `filteredIndividualExpenses` | Gastos individuales con los mismos filtros                                                          |
| `sortedJointExpenses`        | `filteredJointExpenses` ordenados por fecha (asc/desc togglable)                                    |
| `filteredJointTotal`         | Suma de `amount` de `filteredJointExpenses`                                                         |
| `filteredUserTotals`         | Por usuario: parte proporcional del total filtrado                                                  |

No invoca RPCs directamente.

---

### `useHistory`

**Pantalla:** Historial de gastos

**Datos consumidos del contexto:**

- `expenses` — todos los gastos (sin filtro de mes)
- `users`

**Cálculos principales:**

| Valor              | Descripción                                                                                             |
| ------------------ | ------------------------------------------------------------------------------------------------------- |
| `filteredExpenses` | Todos los gastos filtrados por búsqueda, rango de monto y método de división                            |
| `historyData`      | Agrupación de `filteredExpenses` por mes (`YYYY-M`), con total por mes y etiqueta localizada en español |
| `months`           | Claves de `historyData` ordenadas de más reciente a más antiguo                                         |

**Acciones que invocan RPCs:**

- `deleteExpense` → `delete_expense_rpc`

---

### `useForecast`

**Pantalla:** Proyección financiera (próximos 6 meses)

**Datos consumidos del contexto:**

- `expenses`, `incomes`, `deductions`

**Cálculos principales:**

| Valor                        | Descripción                                                                                                                 |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `totalIncome`                | Suma de todos los ingresos del hogar                                                                                        |
| `totalDeductions`            | Suma de todas las deducciones                                                                                               |
| `netMonthlyIncome`           | `totalIncome - totalDeductions`                                                                                             |
| `recurringTemplates`         | Gastos recurrentes deduplicados por descripción (para evitar contar el mismo gasto dos veces)                               |
| `monthlyRecurringTotal`      | Suma de los montos de todas las plantillas recurrentes                                                                      |
| `nextMonths` (array 6 items) | Por cada mes: `income`, `expenses` (reales + recurrentes no pagados aún), `balance` (`income - expenses`), `isCurrentMonth` |
| `projectedSavings`           | `balance` del mes actual                                                                                                    |
| `burnRate`                   | `(gastos mes actual / netMonthlyIncome) * 100`                                                                              |

No invoca RPCs directamente.

---

### `useSetup`

**Pantalla:** Configuración de ingresos, deducciones y vinculación de pareja

**Datos consumidos del contexto:**

- `users`, `incomes`, `deductions`, `inviteCode`, `partner`

**Acciones que invocan RPCs (a través del contexto):**

- `updateIncomes` → `sync_incomes` (reemplaza todos los ingresos del usuario)
- `updateDeductions` → `sync_deductions` (reemplaza todas las deducciones del usuario)
- `joinCouple` → `join_couple_by_code`

No realiza cálculos derivados; gestiona el estado local de edición/creación de ítems antes de sincronizar.

---

### `useProfile`

**Pantalla:** Perfil de usuario

**Datos consumidos del contexto:**

- `profile`, `inviteCode`, `partner`

**Acciones que invocan RPCs:**

- `updateProfile` → `update_user_profile_rpc` (nombre, teléfono, método de división por defecto, `has_seen_onboarding`)
- `supabase.auth.updateUser` — actualiza la contraseña directamente vía Supabase Auth (no RPC propio)

---

### `useScanStatement`

**Pantalla:** Escaneo de extracto bancario con IA

**Datos consumidos del contexto:**

- `users`, `budgets`, `profile`

**Flujo:**

1. El usuario sube un archivo (PDF/imagen de extracto bancario).
2. `expenseService.parseStatement` envía el archivo a la **Edge Function `gemini-ai`**, que retorna un array de `ExtractedExpense`.
3. El hook prepara los gastos como `StagedExpense[]`, infiere el presupuesto por categoría y asigna el método de división según `profile.default_split_method`.
4. El usuario revisa y edita los ítems.
5. Al confirmar, `addExpenses` inserta todos los gastos en lote directamente en la tabla `expenses` (sin RPC, usando `supabase.from('expenses').insert(...)`).

**Cálculos principales:**

| Valor                   | Descripción                                                                             |
| ----------------------- | --------------------------------------------------------------------------------------- |
| `staged items`          | Gastos parseados con `splitMethod`, `paidBy`, `budgetId` inferidos automáticamente      |
| `finalAmount`           | Si el ítem tiene `creditBalance`, aplica el descuento: `originalAmount - creditBalance` |
| `batchId` / `batchName` | UUID y nombre legible para agrupar todos los gastos del escaneo                         |

**Acciones que invocan RPCs / servicios:**

- `expenseService.parseStatement` → Edge Function `gemini-ai`
- `addExpenses` → insert directo en tabla `expenses`

---

### `useLogin`

**Pantalla:** Login / Registro / Recuperación de contraseña

No usa `FinanceContext`. Interactúa directamente con Supabase Auth:

| Acción               | API                                                       |
| -------------------- | --------------------------------------------------------- |
| Registro             | `supabase.auth.signUp` con metadata `name` e `inviteCode` |
| Login                | `supabase.auth.signInWithPassword`                        |
| Recuperar contraseña | `supabase.auth.resetPasswordForEmail`                     |

---

## `summaryService.calculateSummary`

Llamado por `FinanceContext.getSummaryForMonth`, consumido en `useDashboard`.

**Entradas:** `month`, `year`, `users`, `incomes`, `deductions`, `expenses`

**Cálculos por usuario:**

| Campo                  | Cálculo                                                                                       |
| ---------------------- | --------------------------------------------------------------------------------------------- |
| `grossIncome`          | Suma de `amount` de todos sus ingresos                                                        |
| `deductions`           | Suma de `amount` de todas sus deducciones                                                     |
| `netIncome`            | `grossIncome - deductions`                                                                    |
| `shareOfJointExpenses` | Su parte de gastos conjuntos según `splitMethod` (50/50 o proporcional al ingreso neto)       |
| `individualExpenses`   | Suma de gastos con `splitMethod === 'individual'` asignados a él (soporta créditos negativos) |
| `remainingIncome`      | `netIncome - shareOfJointExpenses - individualExpenses`                                       |

**Cálculos globales:**

| Campo                | Cálculo                                |
| -------------------- | -------------------------------------- |
| `totalJointExpenses` | Suma de gastos no individuales del mes |
| `totalExpenses`      | Suma total (créditos restan)           |
