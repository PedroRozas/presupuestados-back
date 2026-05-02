## Paso 1: Inicialización del Proyecto NestJS y Conexión a Supabase

1. **Scaffolding:** Ejecutar `nest new presupuestados-backend --strict`.
2. **Configuración de Entorno:** Configurar `@nestjs/config` para gestionar variables (`SUPABASE_URL`, `SUPABASE_SERVICE_KEY`).
3. **Módulo Supabase:** Crear `SupabaseModule` y `SupabaseService`. El servicio debe instanciar el cliente de Supabase (recomendable usar la Service Role Key para operaciones del backend donde se requiera bypass de RLS, validando el token de usuario en un Guard de autenticación personalizado).

## Paso 2: Creación del Módulo Auth y Migración de 'Couples'

1. **Crear `AuthModule` y `AuthService`:** Este servicio reemplazará la función RPC `initialize_user_data`.
2. **Crear `CouplesModule` y `CouplesService`:** Este servicio reemplazará la función RPC `join_couple_by_code`.
3. **Traducción de Lógica de Inicialización de Usuario en TS (AuthService):**
   - **Endpoint:** `POST /auth/initialize` (Recibe `p_email`, `p_full_name`, y opcionalmente `p_invite_code`).
   - **Paso 2.1:** Actualizar la tabla `profiles` estableciendo `email` y `full_name`.
   - **Paso 2.2:** Si viene `p_invite_code`, delegar vinculación llamando a `CouplesService.joinCouple()`.
   - **Paso 2.3:** Si no viene `p_invite_code` (usuario nuevo sin pareja):
     - Insertar una nueva fila en `couples` generando un código único de 6 caracteres.
     - Actualizar `profiles` asignando el nuevo `couple_id`.
     - Insertar secuencialmente dos filas en `family_members`:
       - Miembro 1: El usuario actual (`linked_user_id = user_id`, `name = p_full_name`).
       - Miembro 2: Espacio vacío para futura pareja (`linked_user_id = NULL`, `name = 'Pareja'`).
4. **Traducción de Lógica de Vinculación en TS (CouplesService):**
   - **Endpoint:** `POST /couples/join` (Recibe `invite_code`).
   - Buscar el `id` en la tabla `couples` donde `invite_code` coincida.
   - Actualizar la tabla `profiles` del usuario autenticado estableciendo su `couple_id`.
   - Lógica de Slots Familiares: Buscar en `family_members` un registro donde `couple_id` coincida y `linked_user_id IS NULL`.
   - Si el slot vacío existe, ejecutar `UPDATE` en `family_members` para asignar el `linked_user_id`. Si no existe, ejecutar `INSERT` de un nuevo `family_members`.

## Paso 3: Creación del Módulo de Gastos (Expenses Module)

1. **Crear `ExpensesModule` y `ExpensesService`:** Reemplaza lógicas como `add_expense_rpc`, `update_expense_rpc` y `split_recurring_expense_rpc`.
2. **Lógica de Cálculo de División:**
   - Crear método privado `calculateSplitDetails(expenseDate: Date, coupleId: string)`.
   - Consultar la tabla `incomes` extrayendo el `amount` de ambos miembros en base al `date` proporcionado [1, 2]. Calcular el porcentaje.
3. **Migración de Edición Recurrente (Mutación de Historial):**
   - **Endpoint:** `PUT /expenses/recurring/:id`
   - **Paso 3.1:** Obtener el gasto actual.
   - **Paso 3.2:** Ejecutar `UPDATE` en `expenses` para el `id` proporcionado fijando `recurrence_end_date = p_cutoff_date` (fecha actual de la edición) [4].
   - **Paso 3.3:** Construir un nuevo DTO con la información editada.
   - **Paso 3.4:** Ejecutar `INSERT` en `expenses` asignando los nuevos montos, mapeando estrictamente `paid_by` y `assigned_user_id` a los UUIDs de `family_members`, asegurando que `recurrence_end_date` sea nulo [2, 4-6].

## Paso 4: Creación del Módulo IA (Procesamiento de Estados de Cuenta)

1. **Crear `AIModule`:** Integración con proveedores de LLM (ej. Gemini o OpenAI).
2. **Endpoint de Recepción:** `POST /ai/process-statement` que acepte archivos `multipart/form-data` (imágenes/PDFs).
3. **Flujo de Extracción:**
   - Enviar el documento al LLM instruyendo la extracción de un array JSON con fecha, descripción y monto.
   - **Mapeo de Categorías:** Consultar la tabla `expense_categories` para obtener el catálogo (id y name) [2, 18]. Solicitar al LLM que asigne el `category_id` (integer) más apropiado a cada línea [1, 2].
4. **Inserción en Lote (Batch):**
   - Generar un UUID aleatorio para `batch_id` y un string representativo para `batch_name` (ej. "Estado de cuenta BCI Marzo").
   - Iterar el array procesado y ejecutar un `INSERT` masivo en `expenses`, incluyendo el `batch_id` y el `category_id` mapeado [1, 2].

## Paso 5: Creación del Módulo Chatbot (RAG con Function Calling)

1. **Crear `ChatbotModule`:** Gestión de la interacción conversacional basada en RAG (Retrieval-Augmented Generation) [1, 19].
2. **Configuración de Function Calling / Tools:**
   - Configurar el SDK de IA para invocar funciones puras de TypeScript del `ExpensesService`.
   - **Tool 1:** `get_monthly_expenses`: Ejecuta un `.select()` a `expenses` filtrando por `couple_id` y rango de fechas de un mes [1].
   - **Tool 2:** `get_incomes`: Ejecuta un `.select()` a `incomes` para verificar los sueldos y explicar el cálculo proporcional [1].
   - **Tool 3:** `update_expense_category`: Recibe un ID de gasto y un `category_id`, ejecutando un `.update()` en la base de datos [1].
3. **Flujo de Respuesta:** Retornar al frontend la respuesta sintetizada de la IA sin sobrecargar el prompt inicial con toda la base de datos, consumiendo solo los datos bajo demanda.

## Paso 6: Creación de Endpoints CRUD Generales (Lectura y Escritura)
El backend debe exponer una API REST completa para que el frontend no se comunique directamente con Supabase.
1. **Módulo de Usuarios (`Profiles`/`Family`):** - `GET /profiles/me`: Retorna el perfil actual, el `couple_id` y los miembros de la familia (`family_members`).
   - `PUT /profiles/me`: Actualiza nombre, método de división por defecto, etc.
2. **Módulo de Gastos (`Expenses`):**
   - `GET /expenses`: Lista gastos con filtros por mes, `couple_id` y paginación.
   - `POST /expenses`: Creación de un gasto manual (individual o compartido).
   - `DELETE /expenses/:id`: Eliminación de un gasto.
3. **Módulos Adicionales (`Incomes` y `Budgets`):**
   - Crear `IncomesModule` y `BudgetsModule`.
   - Implementar endpoints `GET`, `POST`, `PUT`, `DELETE` para que el usuario pueda gestionar sus sueldos mensuales y sus presupuestos desde la app.
4. **Módulo Dashboard (`DashboardModule`):**
   - **Endpoint:** `GET /dashboard`.
   - **Lógica:** Debe traducir el comportamiento de la antigua RPC `get_dashboard_data`. Debe usar `Promise.all` para consultar concurrentemente las tablas `family_members`, `incomes`, `deductions`, `budgets` y `expenses` (filtrando por `couple_id`), devolviendo un único objeto JSON consolidado para la carga inicial de la app.
