# Plan de conciliación: registro, parejas y exportación

## Objetivo

Cerrar las brechas detectadas en pruebas con cuenta registrada, dejando el flujo consistente con la promesa del producto:

- El registro debe decir claramente si la cuenta quedó pendiente de confirmación o si el correo ya estaba registrado.
- Una pareja debe tener como máximo dos usuarios vinculados, salvo que decidamos explícitamente soportar grupos.
- El nombre visible del usuario vinculado debe quedar correcto desde el primer alta, no recién después de editar perfil.
- Los cálculos financieros no deben entrar en estados ambiguos cuando la data histórica ya tenga más de dos miembros.
- La exportación disponible en demo debe tener equivalente claro en la experiencia con registro.

## Diagnóstico actual

### Registro con correo existente

Hoy `POST /auth/register` siempre responde que hay que revisar el correo cuando `supabase.auth.signUp` devuelve usuario sin error. Esto produce una mala señal cuando Supabase no reenvía confirmación porque el correo ya existe.

Referencias:

- `src/auth/auth.service.ts:56`: registro delega directo a Supabase Auth.
- `src/auth/auth.service.ts:81`: mensaje fijo de confirmación.
- `src/auth/auth.service.ts:120`: login bloquea usuarios no confirmados, pero deja entrar a usuarios existentes ya confirmados.

Decisión propuesta:

- En registro, revelar que el correo ya existe y devolver `409 Conflict` con código estable `EMAIL_ALREADY_REGISTERED`.
- Mantener rate limiting de registro para reducir abuso y enumeración.
- Mensaje UX sugerido: "Ese correo ya tiene una cuenta. Inicia sesión o recupera tu contraseña."

Notas de seguridad:

- Esto implica revelar existencia de cuenta en el formulario de registro. Es aceptable si priorizamos evitar abandono por confusión, pero debe quedar protegido por rate limit y logging.
- En recuperación de contraseña se mantiene la respuesta genérica actual para no enumerar correos.

### Confirmación de correo

El comportamiento esperado debe ser explícito:

- Correo nuevo: crear usuario, enviar confirmación, bloquear login hasta confirmar.
- Correo existente confirmado: no prometer confirmación; responder cuenta existente.
- Correo existente no confirmado: responder cuenta existente no confirmada y ofrecer reenvío de confirmación, o responder cuenta existente de forma genérica.

Decisión propuesta:

- Agregar endpoint `POST /auth/resend-confirmation` con rate limit.
- En `POST /auth/register`, si el correo ya existe y no está confirmado, responder `409` con código `EMAIL_PENDING_CONFIRMATION` y mensaje para reenviar confirmación.
- Si Supabase no permite distinguir ambos casos de forma confiable sin una consulta admin eficiente, usar un solo `EMAIL_ALREADY_REGISTERED` y dejar el reenvío disponible desde la UI.

### Nombre inicial queda como "Pareja"

El alta de una pareja nueva crea un slot vacío con nombre `Pareja`. Al unirse otro usuario con código, `CouplesService.joinCouple` asigna `linked_user_id`, pero no actualiza `name`; por eso el otro usuario ve "Pareja" hasta que se edita perfil.

Referencias:

- `src/auth/auth.service.ts:363`: miembro principal se crea con `dto.p_full_name`.
- `src/auth/auth.service.ts:381`: slot vacío se crea como `Pareja`.
- `src/couples/couples.service.ts:79`: al ocupar slot vacío solo se actualiza `linkedUserId`.

Decisión propuesta:

- Cambiar `joinCouple` para recibir o resolver el `fullName` del usuario.
- Al ocupar un slot vacío, actualizar `linkedUserId`, `ownerId` si corresponde y `name = profile.fullName`.
- Si el usuario no tiene nombre válido, usar el prefijo local actual solo como fallback temporal.
- Mantener la sincronización existente de `ProfilesService.updateMyProfile`, que ya propaga cambios de nombre a `family_members`.

### Tercer usuario aceptado con el mismo código

Hoy, si una pareja no tiene slot vacío, `joinCouple` inserta un nuevo `family_member`. Ese comportamiento convierte una pareja en grupo sin que el resto del dominio esté preparado.

Referencias:

- `src/couples/couples.service.ts:60`: busca slot vacío.
- `src/couples/couples.service.ts:83`: si no hay slot, inserta un nuevo miembro.
- `src/couples/couples.service.ts:114`: `getLinkedPartnerEmail` devuelve solo un partner aunque existan varios.

Decisión propuesta:

- Mantener el producto como pareja de dos personas.
- Bloquear nuevos joins cuando la pareja ya tenga dos `family_members.linked_user_id` no nulos.
- Responder `409 Conflict` con código estable `COUPLE_ALREADY_FULL`.
- Mensaje UX sugerido: "Este código ya fue usado por otra cuenta. Pide a tu pareja generar o revisar su vínculo."

Reglas backend:

- Un usuario que ya pertenece a una pareja no puede unirse a otra sin flujo explícito de desvinculación.
- Un usuario no puede usar su propio código.
- Un código inexistente responde `404` o `400` con `INVITE_CODE_INVALID`.
- Un código de pareja llena responde `409` con `COUPLE_ALREADY_FULL`.

### Integridad de base de datos

El bloqueo solo en servicio no basta si hay concurrencia o datos escritos por rutas antiguas.

Acciones propuestas:

- Agregar índice único parcial en `family_members(linked_user_id)` donde `linked_user_id IS NOT NULL`.
- Agregar validación transaccional en `joinCouple`: leer pareja, leer perfil actual, contar miembros vinculados, ocupar slot o fallar.
- Evaluar constraint o trigger de máximo dos miembros vinculados por `couple_id`. PostgreSQL no soporta este máximo con un `CHECK` simple; si evitamos triggers por política del proyecto, se cubre con transacción + prueba de concurrencia.
- Crear script/migración de saneamiento para parejas con más de dos usuarios vinculados antes de activar la restricción lógica.

### Cálculos 50/50 con más de dos miembros

Si ya existe data corrupta con tres usuarios vinculados, algunos cálculos reparten gastos 50/50 dividiendo por `2`, por lo que tres usuarios muestran 50% cada uno.

Referencias:

- `src/dashboard/dashboard.service.ts:288`: resumen mensual usa `amt / 2`.
- `src/expenses/expenses.service.ts:804`: cashflow usa `amount / 2`.
- `src/expenses/expenses.service.ts:1043`: scope de usuario usa `expense.amount / 2`.

Decisión propuesta:

- Solución principal: impedir que existan más de dos usuarios vinculados.
- Solución defensiva: reemplazar divisiones hardcodeadas por `linkedMembers.length`, con mínimo `2` solo cuando falte información.
- Agregar una alerta/log de integridad si `linkedMembers.length !== 2`, para detectar datos anómalos sin romper la pantalla.
- Para registros históricos con tres usuarios, definir manualmente cuál usuario se desvincula o se migra a una pareja nueva.

### Generación y unicidad del código de pareja

Hoy el código se genera aleatoriamente con base36 de 6 caracteres y se reintenta ante colisión de índice único.

Referencias:

- `src/auth/auth.service.ts:307`: generación actual.
- `src/auth/auth.service.ts:315`: retry ante colisión.
- `src/database/schema/index.ts:19`: `inviteCode` es único.

Decisión propuesta:

- Mantener código aleatorio, no procedural.
- Cambiar generación a `crypto.randomBytes` o `crypto.randomInt` para evitar `Math.random`.
- Mantener `UNIQUE(invite_code)` como garantía final.
- Subir retries de 3 a 10 y registrar colisiones.
- Normalizar siempre a uppercase en creación y join.

### Exportación PDF en cuenta registrada

La demo permite PDF y la cuenta registrada aparentemente solo XLS. En backend no hay endpoint de exportación PDF/XLS para gastos; existe un script local `scripts/generate-summary-pdf.mjs`, pero no está integrado como API.

Decisión propuesta:

- Definir una API común para exportación registrada:
  - `GET /exports/monthly-summary?month=MM&year=YYYY&format=pdf|xlsx`
  - o, si se prefiere mantener dominio de gastos: `GET /expenses/export?month=MM&year=YYYY&format=pdf|xlsx`.
- Reutilizar `DashboardService.getSummary` y datos de gastos/ingresos para que PDF y XLS salgan de la misma fuente.
- PDF debe incluir el mismo resumen estructurado que la demo: totales, usuarios, gastos conjuntos, gastos individuales, categorías y período.
- XLS debe quedar como alternativa tabular, no como reemplazo del PDF.

## Plan de implementación

### Fase 1: Registro claro

- Agregar normalización centralizada de email en `AuthService`.
- Antes de `signUp`, detectar cuenta existente usando la fuente más confiable disponible:
  - Preferido: consulta admin a Supabase Auth por email, si la SDK/proyecto lo permite eficientemente.
  - Fallback: `profiles.email` con índice único, sabiendo que no cubre cuentas auth aún no inicializadas.
- Devolver errores estables:
  - `EMAIL_ALREADY_REGISTERED`
  - `EMAIL_PENDING_CONFIRMATION`
  - `EMAIL_CONFIRMATION_REQUIRED`
- Agregar `POST /auth/resend-confirmation` si se decide distinguir pendientes.
- Tests unitarios de registro para correo nuevo, correo existente confirmado y correo pendiente.

### Fase 2: Join de pareja robusto

- Cambiar `CouplesService.joinCouple(userId, inviteCode)` para:
  - Normalizar código.
  - Validar perfil del usuario y nombre.
  - Rechazar si el usuario ya tiene `coupleId`.
  - Rechazar si el código pertenece a la pareja actual del usuario.
  - Contar miembros vinculados de la pareja destino.
  - Rechazar si ya hay dos miembros vinculados.
  - Ocupar el slot vacío actualizando `linkedUserId`, `ownerId` y `name`.
- Hacer que `AuthService.initializeUserData` pase por la misma lógica al recibir `p_invite_code`.
- Tests unitarios para código inválido, pareja llena, usuario ya vinculado, nombre correcto y unión exitosa.

### Fase 3: Limpieza y guardas de integridad

- Crear consulta de diagnóstico para detectar parejas con más de dos usuarios vinculados.
- Crear migración/script de saneamiento manual asistido:
  - Listar `couple_id`, miembros, emails y gastos asociados.
  - Elegir qué usuario queda vinculado y qué usuario se separa.
  - No borrar gastos automáticamente sin revisión.
- Agregar índice único parcial para `linked_user_id`.
- Evaluar si hace falta una tabla o estado para invalidar códigos ya usados; para pareja de dos, basta con `COUPLE_ALREADY_FULL`.

### Fase 4: Cálculos defensivos

- Centralizar helper `getLinkedMemberCount` o `calculateEqualSplitShare`.
- Reemplazar `amount / 2` por divisor basado en miembros vinculados cuando el método sea `50/50`.
- Si hay menos de dos miembros vinculados, seguir usando divisor 2 para mantener el concepto de pareja y no duplicar el gasto del usuario único.
- Si hay más de dos miembros, repartir por cantidad real y emitir log de integridad hasta sanear data.
- Tests en `DashboardService` y `ExpensesService` para 1, 2 y 3 miembros vinculados.

### Fase 5: Exportación PDF/XLS registrada

- Crear `ExportsModule` o extender `ExpensesController`, según preferencia de arquitectura.
- Implementar DTO/query con `month`, `year`, `format`.
- Para `pdf`, generar desde datos del backend y devolver `Content-Type: application/pdf`.
- Para `xlsx`, devolver `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`.
- Mantener paridad visual/contenido con la demo: el usuario registrado debe encontrar PDF en el mismo lugar conceptual que XLS.
- Tests de autorización, MIME type, filtros por `coupleId` y período.

## Criterios de aceptación

- Registrar un correo nuevo responde confirmación pendiente y el login queda bloqueado hasta confirmar.
- Registrar un correo ya existente no responde "revisa tu correo"; responde cuenta existente.
- Al unirse con código, el otro usuario ve inmediatamente el nombre ingresado, no "Pareja".
- Un tercer usuario usando el mismo código recibe `COUPLE_ALREADY_FULL` y no queda vinculado.
- `GET /profiles/me`, `GET /family-members`, dashboard, gráficos y listas muestran los mismos dos usuarios.
- Ningún cálculo 50/50 muestra 50% para tres usuarios si existe data histórica corrupta.
- El código de invitación es aleatorio, único por constraint y con retry robusto.
- La cuenta registrada puede exportar PDF y XLS desde datos filtrados por usuario/couple/mes.

## Orden recomendado

1. Bloquear tercer usuario y corregir nombre al unirse.
2. Saneamiento de data existente con más de dos miembros.
3. Mensajes de registro y reenvío de confirmación.
4. Cálculos defensivos contra data anómala.
5. Exportación PDF para cuenta registrada.

Este orden reduce primero el daño de integridad y después mejora la experiencia visible del registro/exportación.
