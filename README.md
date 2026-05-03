# Presupuestados Back

API REST de Presupuestados, construida con NestJS y TypeScript. Centraliza la
autenticacion, perfiles, parejas, gastos, ingresos, presupuestos, deducciones,
dashboard financiero y funciones asistidas por IA para que el frontend no
acceda directamente a Supabase.

## Stack

- NestJS 11 + TypeScript
- Supabase Auth y PostgreSQL
- Drizzle ORM / Drizzle Kit para migraciones SQL
- OpenAI para lectura de cartolas y chatbot financiero
- Redis opcional para limites de abuso y rate limiting
- Swagger en desarrollo

## Requisitos

- Node.js
- npm
- Proyecto Supabase con URL, service role key y base PostgreSQL
- API key de OpenAI si se usan las funciones de IA
- Redis si se quiere persistir rate limiting fuera de memoria

## Configuracion local

1. Instalar dependencias:

```bash
npm install
```

2. Crear el archivo de entorno:

```bash
cp .env.example .env
```

3. Completar las variables principales:

```bash
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_KEY=your-service-role-key
DATABASE_URL=postgresql://postgres:[PASSWORD]@db.[PROJECT_ID].supabase.co:5432/postgres
OPENAI_API_KEY=your-openai-api-key
CORS_ORIGIN=http://localhost:3000
PORT=3001
```

`PORT` es opcional en el codigo y por defecto usa `3000`. Si corres el frontend
de Vite en `3000`, usa otro puerto para el backend y actualiza `VITE_API_URL`
en el frontend.

## Ejecutar

```bash
# Desarrollo con watch
npm run start:dev

# Desarrollo sin watch
npm run start

# Produccion despues de compilar
npm run build
npm run start:prod
```

Con `NODE_ENV` distinto de `production`, Swagger queda disponible en:

```text
http://localhost:<PORT>/api
```

## Scripts utiles

```bash
npm run build       # Compila el proyecto NestJS
npm run lint        # Ejecuta ESLint con fix
npm run format      # Formatea archivos TS con Prettier
npm run test        # Pruebas unitarias
npm run test:e2e    # Pruebas end-to-end
npm run test:cov    # Cobertura de tests
npm run db:generate # Genera migraciones Drizzle
npm run db:migrate  # Aplica migraciones Drizzle
npm run db:studio   # Abre Drizzle Studio
```

## Arquitectura

La aplicacion esta organizada por modulos de NestJS:

- `auth`: registro, login, refresh, logout, usuario actual y recuperacion de password.
- `profiles`: lectura y actualizacion del perfil autenticado.
- `couples` y `partner-requests`: vinculacion de pareja e invitaciones.
- `family-members`: miembros asociados a la unidad familiar.
- `expenses`: gastos, gastos recurrentes, detencion de recurrencias y eliminacion por lote.
- `incomes`: ingresos del hogar.
- `deductions`: deducciones aplicadas al presupuesto.
- `budgets`: presupuestos y resumen por presupuesto.
- `categories`: categorias de gastos.
- `dashboard`: payload consolidado para la carga inicial y resumen financiero.
- `ai`: procesamiento de cartolas o estados de cuenta.
- `chatbot`: asistente financiero con herramientas controladas por backend.
- `ai-usage`: estado de uso y limites de funciones IA.
- `security`: rate limiting, Redis opcional y eventos de seguridad.
- `database` y `supabase`: acceso a PostgreSQL/Supabase.

## Endpoints principales

- `POST /auth/register`
- `POST /auth/login`
- `POST /auth/refresh`
- `POST /auth/logout`
- `GET /auth/me`
- `POST /auth/initialize`
- `POST /auth/forgot-password`
- `PUT /auth/update-password`
- `GET /dashboard`
- `GET /dashboard/bootstrap`
- `GET /dashboard/summary`
- `GET|POST|PUT|DELETE /expenses`
- `GET|POST|PUT|DELETE /incomes`
- `GET|POST|PUT|DELETE /deductions`
- `GET|POST|PUT|DELETE /budgets`
- `POST /ai/process-statement`
- `POST /chatbot/chat`
- `GET /ai-usage/status`

La documentacion completa de rutas y DTOs se puede revisar en Swagger durante
desarrollo.

## Autenticacion y seguridad

El backend valida tokens Bearer emitidos por Supabase Auth. El cliente del
backend usa `SUPABASE_SERVICE_KEY`, por lo que las reglas de acceso deben
quedar protegidas en los guards, servicios y consultas del backend.

La app habilita:

- CORS con credenciales para el origen configurado en `CORS_ORIGIN`.
- `helmet` para headers de seguridad.
- `cookie-parser` para sesiones y refresh token.
- `ValidationPipe` global con `whitelist`, `forbidNonWhitelisted` y `transform`.
- Limites de uso configurables mediante variables `RATE_LIMIT_*`.

## Base de datos

El schema Drizzle vive en:

```text
src/database/schema/index.ts
```

Las migraciones generadas se guardan en:

```text
drizzle/
```

Flujo habitual:

```bash
npm run db:generate
npm run db:migrate
```

## Relacion con el frontend

El frontend debe consumir esta API mediante `VITE_API_URL`. Para desarrollo,
mantener alineados:

- `PORT` del backend.
- `CORS_ORIGIN` del backend.
- `VITE_API_URL` del frontend.

Ejemplo comun:

```text
Backend:  PORT=3001, CORS_ORIGIN=http://localhost:3000
Frontend: VITE_API_URL=http://localhost:3001
```
