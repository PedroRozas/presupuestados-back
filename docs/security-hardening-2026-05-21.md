# Security Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cerrar los 14 hallazgos del pentest interno (2 High + 6 Medium + 6 Low) sobre `presupuestados-back` y `presupuestados-web`, sin romper funcionalidad existente y con tests donde aplique.

**Architecture:**
- **Backend:** NestJS + Drizzle + Supabase. Cambios aislados por módulo (`auth`, `partner-requests`, `profiles`, `security`, `supabase`). Cada fix tipea estrictamente, valida con `class-validator`, y se prueba con Jest cuando hay lógica nueva.
- **Frontend:** React + MUI + Vite. Cambios concentrados en `UpdatePassword.tsx`, `auth.api.ts`, `types/auth.ts` y `vercel.json`.
- Las tareas están ordenadas por severidad (High → Medium → Low) y se commitean por fix para revisión granular.

**Tech Stack:**
- Backend: NestJS 11, TypeScript ESM, Supabase JS, Drizzle, Helmet, class-validator, Jest.
- Frontend: React 19, MUI 5, Vite 5, TypeScript.
- Deploy: Vercel (front) + Docker/VPS (back).

**Convenciones del repo (aplican a todas las tareas):**
- Español en mensajes de usuario / logs / commits.
- Conventional Commits (`fix:`, `feat:`, `refactor:`, `chore:`, `test:`).
- TypeScript estricto, sin `any`.
- Cero comentarios en código nuevo (los nombres bastan).
- Imports relativos con `.js` en TS (ESM).

---

## File Structure

### Archivos a CREAR
- `presupuestados-back/src/auth/dto/reset-password.dto.ts` — DTO para reset por email.
- `presupuestados-back/src/auth/dto/update-password.dto.ts` (sobrescribir) — DTO con `current_password` + `new_password`.
- `presupuestados-back/src/auth/auth.service.security.spec.ts` — Tests de los nuevos flujos.

### Archivos a MODIFICAR
**Backend:**
- `presupuestados-back/src/supabase/supabase.service.ts` — Separar admin vs public client.
- `presupuestados-back/src/auth/auth.controller.ts` — Endpoint nuevo `reset-password`, rate-limits.
- `presupuestados-back/src/auth/auth.service.ts` — Reescribir `updatePassword`, agregar `resetPassword`, eliminar `findAuthUserByEmail`, fix `logout`, hash de emails en logs, hardcode redirect path.
- `presupuestados-back/src/auth/dto/register.dto.ts` — MinLength 12 (con excepción para login).
- `presupuestados-back/src/profiles/dto/update-profile.dto.ts` — Validar `avatar_url` (IsUrl) y `phone`.
- `presupuestados-back/src/partner-requests/partner-requests.service.ts` — Normalizar email a lowercase.
- `presupuestados-back/src/partner-requests/dto/send-invite.dto.ts` — `@Transform` lowercase.
- `presupuestados-back/src/security/rate-limit.service.ts` — Salt obligatorio en prod.
- `presupuestados-back/src/security/security.types.ts` — Política `passwordUpdate`.
- `presupuestados-back/src/security/security.constants.ts` — Defaults `passwordUpdate`.
- `presupuestados-back/src/main.ts` — `urlencoded extended=false`, warning TRUST_PROXY.
- `presupuestados-back/.env.example` — Salt sanitizado + vars nuevas.

**Frontend:**
- `presupuestados-web/src/api/auth.api.ts` — Endpoints `resetPassword` + `updatePassword` con current.
- `presupuestados-web/src/api/types/auth.ts` — Tipos nuevos.
- `presupuestados-web/src/pages/UpdatePassword.tsx` — Bifurcar UI logueado vs recovery.
- `presupuestados-web/vercel.json` — Headers CSP / HSTS / X-Frame-Options.

---

## Fase 0 — Setup

### Task 0: Branch y baseline

**Files:** ninguno (operaciones git).

- [ ] **Step 1: Crear rama de seguridad**

```bash
cd /Users/pedrorozas/personal/presupuestados/presupuestados-back
git checkout -b security/hardening-2026-05-21
cd /Users/pedrorozas/personal/presupuestados/presupuestados-web
git checkout -b security/hardening-2026-05-21
```

- [ ] **Step 2: Correr suites actuales para baseline**

```bash
cd /Users/pedrorozas/personal/presupuestados/presupuestados-back
npm test -- --runInBand
```

Expected: tests pasan (anotar cuántos pasan; si alguno falla, capturar nombre para no atribuirlo a este trabajo).

- [ ] **Step 3: Verificar build TypeScript limpio**

```bash
cd /Users/pedrorozas/personal/presupuestados/presupuestados-back && npx tsc --noEmit
cd /Users/pedrorozas/personal/presupuestados/presupuestados-web && npx tsc --noEmit
```

Expected: PASS sin errores.

---

## Fase 1 — High Severity

### Task 1: Separar cliente Supabase admin vs público (H2)

**Files:**
- Modify: `presupuestados-back/src/supabase/supabase.service.ts`
- Modify: `presupuestados-back/.env.example`
- Modify: `presupuestados-back/src/auth/auth.service.ts` (renombrar callers)

**Contexto:** Hoy `createAuthClient()` usa `SUPABASE_SERVICE_KEY` para login, refresh, signUp, resetPasswordForEmail y resend. Eso bypassea protecciones de Supabase Auth. Hay que dividir en `createPublicAuthClient()` (anon key) y `createAdminAuthClient()` (service role, sólo para `admin.*` y queries de datos).

- [ ] **Step 1: Agregar `SUPABASE_ANON_KEY` a `.env.example`**

Editar `presupuestados-back/.env.example`, agregar línea debajo de `SUPABASE_SERVICE_KEY`:

```
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_KEY=your-service-role-key
SUPABASE_ANON_KEY=your-anon-public-key
DATABASE_URL=postgresql://postgres:[PASSWORD]@db.[PROJECT_ID].supabase.co:5432/postgres
```

Después indicar al usuario por mensaje (no commit) que debe agregar `SUPABASE_ANON_KEY` real a su `.env` local copiándola del Dashboard de Supabase (Settings → API → `anon` `public`).

- [ ] **Step 2: Reemplazar `supabase.service.ts` completo**

Sobrescribir `presupuestados-back/src/supabase/supabase.service.ts` con:

```ts
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { Database } from './database.types.js';

@Injectable()
export class SupabaseService {
  private readonly client: SupabaseClient<Database>;
  private readonly supabaseUrl: string;
  private readonly supabaseServiceKey: string;
  private readonly supabaseAnonKey: string;

  constructor(private readonly configService: ConfigService) {
    this.supabaseUrl = this.configService.getOrThrow<string>('SUPABASE_URL');
    this.supabaseServiceKey = this.configService.getOrThrow<string>(
      'SUPABASE_SERVICE_KEY',
    );
    this.supabaseAnonKey = this.configService.getOrThrow<string>(
      'SUPABASE_ANON_KEY',
    );

    this.client = createClient(this.supabaseUrl, this.supabaseServiceKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });
  }

  getClient(): SupabaseClient<Database> {
    return this.client;
  }

  createAdminAuthClient(): SupabaseClient<Database> {
    return createClient(this.supabaseUrl, this.supabaseServiceKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });
  }

  createPublicAuthClient(): SupabaseClient<Database> {
    return createClient(this.supabaseUrl, this.supabaseAnonKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });
  }
}
```

- [ ] **Step 3: Migrar callers en `auth.service.ts`**

En `presupuestados-back/src/auth/auth.service.ts`, reemplazar todas las llamadas `this.supabaseService.createAuthClient()` siguiendo este criterio:
- Si la llamada inmediatamente siguiente usa `auth.admin.*` → `createAdminAuthClient()`.
- Si usa `auth.signInWithPassword`, `auth.signUp`, `auth.refreshSession`, `auth.resetPasswordForEmail`, `auth.resend`, `auth.verifyOtp`, `auth.getUser` → `createPublicAuthClient()`.

Cambios puntuales (usar Edit por cada uno, busca el bloque exacto):

En `register()` (línea ~67):
```ts
    const authClient = this.supabaseService.createPublicAuthClient();
```

En `login()` (línea ~132):
```ts
    const supabase = this.supabaseService.createPublicAuthClient();
```

En `refresh()` (línea ~186):
```ts
    const supabase = this.supabaseService.createPublicAuthClient();
```

En `findAuthUserByEmail()` (línea ~343) — usa `admin.listUsers`:
```ts
    const supabase = this.supabaseService.createAdminAuthClient();
```

En `forgotPassword()` (línea ~622):
```ts
    const supabase = this.supabaseService.createPublicAuthClient();
```

En `resendConfirmation()` (línea ~684):
```ts
    const supabase = this.supabaseService.createPublicAuthClient();
```

(`updatePassword` se reescribe en Task 2, no tocar aquí.)

- [ ] **Step 4: Type check**

```bash
cd /Users/pedrorozas/personal/presupuestados/presupuestados-back && npx tsc --noEmit
```

Expected: PASS, ningún error.

- [ ] **Step 5: Smoke test manual**

```bash
cd /Users/pedrorozas/personal/presupuestados/presupuestados-back && npm run start:dev
```

En otra terminal:
```bash
curl -i -X POST http://localhost:3000/auth/login -H "Content-Type: application/json" -d '{"email":"NO_EXISTE@example.com","password":"badpass"}'
```

Expected: HTTP 401 con body JSON `{ "statusCode": 401, "message": "Credenciales inválidas. Verifica tu email y contraseña." }`. Si el server arranca sin gritar `SUPABASE_ANON_KEY missing` y este endpoint responde 401 (no 500), el cliente anon funciona. Detener server (Ctrl+C).

- [ ] **Step 6: Commit**

```bash
cd /Users/pedrorozas/personal/presupuestados/presupuestados-back
git add src/supabase/supabase.service.ts src/auth/auth.service.ts .env.example
git commit -m "refactor(auth): split Supabase client into admin/public to stop misusing service role"
```

---

### Task 2: Endpoint `update-password` requiere password actual (H1 — flujo logged-in)

**Files:**
- Modify: `presupuestados-back/src/auth/dto/update-password.dto.ts`
- Modify: `presupuestados-back/src/auth/auth.service.ts`
- Modify: `presupuestados-back/src/auth/auth.controller.ts`
- Modify: `presupuestados-back/src/security/security.types.ts`
- Modify: `presupuestados-back/src/security/security.constants.ts`
- Modify: `presupuestados-back/src/security/rate-limit.service.ts`
- Modify: `presupuestados-back/.env.example`

**Contexto:** El endpoint actual permite cambiar la contraseña con cualquier `access_token` válido sin pedir la actual y sin rate-limit. Cambio: el endpoint logged-in pide `current_password` y re-autentica. El flujo de recovery (token de email) va por un endpoint distinto (Task 3).

- [ ] **Step 1: Reescribir `update-password.dto.ts`**

Sobrescribir `presupuestados-back/src/auth/dto/update-password.dto.ts`:

```ts
import { IsString, MinLength } from 'class-validator';

export class UpdatePasswordDto {
  @IsString({ message: 'La contraseña actual debe ser un texto' })
  @MinLength(1, { message: 'La contraseña actual es requerida' })
  current_password!: string;

  @IsString({ message: 'La nueva contraseña debe ser un texto' })
  @MinLength(12, {
    message: 'La nueva contraseña debe tener al menos 12 caracteres',
  })
  new_password!: string;
}
```

- [ ] **Step 2: Agregar política `passwordUpdate` a `security.types.ts`**

Editar `presupuestados-back/src/security/security.types.ts`:

Reemplazar:
```ts
export type RateLimitPolicy =
  | 'authLogin'
  | 'authRegister'
  | 'passwordReset'
  | 'authRefresh'
  | 'chatbot'
  | 'ai';

export type RateLimitScope =
  | 'global'
  | 'auth_login'
  | 'auth_register'
  | 'password_reset'
  | 'auth_refresh'
  | 'chatbot'
  | 'ai';
```

Por:
```ts
export type RateLimitPolicy =
  | 'authLogin'
  | 'authRegister'
  | 'passwordReset'
  | 'passwordUpdate'
  | 'authRefresh'
  | 'chatbot'
  | 'ai';

export type RateLimitScope =
  | 'global'
  | 'auth_login'
  | 'auth_register'
  | 'password_reset'
  | 'password_update'
  | 'auth_refresh'
  | 'chatbot'
  | 'ai';
```

- [ ] **Step 3: Agregar defaults a `security.constants.ts`**

Editar `presupuestados-back/src/security/security.constants.ts`. Reemplazar el bloque `DEFAULT_RATE_LIMITS` para agregar tres keys nuevas al final:

```ts
export const DEFAULT_RATE_LIMITS = {
  globalWindowSeconds: 60,
  globalMax: 120,
  authWindowSeconds: 900,
  authIpMax: 10,
  authEmailMax: 5,
  authComboMax: 5,
  registerWindowSeconds: 3600,
  registerIpMax: 5,
  registerEmailMax: 3,
  passwordResetWindowSeconds: 3600,
  passwordResetIpMax: 5,
  passwordResetEmailMax: 3,
  passwordUpdateWindowSeconds: 900,
  passwordUpdateUserMax: 5,
  passwordUpdateIpMax: 10,
  refreshWindowSeconds: 900,
  refreshMax: 30,
  chatbotUserWindowSeconds: 60,
  chatbotUserMax: 10,
  chatbotIpWindowSeconds: 600,
  chatbotIpMax: 30,
  aiUserWindowSeconds: 300,
  aiUserMax: 5,
  aiIpWindowSeconds: 900,
  aiIpMax: 10,
} as const;
```

- [ ] **Step 4: Implementar reglas `passwordUpdate` en `rate-limit.service.ts`**

Editar `presupuestados-back/src/security/rate-limit.service.ts`. Dentro del `switch (policy)` de `getPolicyRules`, agregar un `case` nuevo **antes** del `case 'authRefresh':`:

```ts
      case 'passwordUpdate':
        return [
          {
            scope: 'password_update',
            routeKey: 'auth:update-password',
            identity: 'user',
            windowSeconds: this.getNumber(
              'RATE_LIMIT_PASSWORD_UPDATE_WINDOW_SECONDS',
              DEFAULT_RATE_LIMITS.passwordUpdateWindowSeconds,
            ),
            max: this.getNumber(
              'RATE_LIMIT_PASSWORD_UPDATE_USER_MAX',
              DEFAULT_RATE_LIMITS.passwordUpdateUserMax,
            ),
            cooldownSeconds: this.getNumber(
              'RATE_LIMIT_PASSWORD_UPDATE_COOLDOWN_SECONDS',
              DEFAULT_RATE_LIMITS.passwordUpdateWindowSeconds,
            ),
            eventType: 'password_reset_limited',
          },
          {
            scope: 'password_update',
            routeKey: 'auth:update-password',
            identity: 'ip',
            windowSeconds: this.getNumber(
              'RATE_LIMIT_PASSWORD_UPDATE_WINDOW_SECONDS',
              DEFAULT_RATE_LIMITS.passwordUpdateWindowSeconds,
            ),
            max: this.getNumber(
              'RATE_LIMIT_PASSWORD_UPDATE_IP_MAX',
              DEFAULT_RATE_LIMITS.passwordUpdateIpMax,
            ),
            eventType: 'password_reset_limited',
          },
        ];
```

- [ ] **Step 5: Reescribir `updatePassword` en `auth.service.ts`**

Editar `presupuestados-back/src/auth/auth.service.ts`. Reemplazar todo el método `updatePassword` (líneas ~702-727) por:

```ts
  async updatePassword(
    userId: string,
    userEmail: string,
    dto: UpdatePasswordDto,
  ): Promise<{ message: string }> {
    this.logger.log(
      `Actualizando contraseña para usuario: ${this.hashUserId(userId)}`,
    );

    const publicClient = this.supabaseService.createPublicAuthClient();
    const { error: reauthError } = await publicClient.auth.signInWithPassword({
      email: userEmail,
      password: dto.current_password,
    });

    if (reauthError) {
      this.securityEventsService.logLoginFailed(
        userEmail,
        'password_update_reauth_failed',
      );
      throw new UnauthorizedException('La contraseña actual no es válida');
    }

    if (dto.current_password === dto.new_password) {
      throw new BadRequestException(
        'La nueva contraseña debe ser distinta de la actual',
      );
    }

    const adminClient = this.supabaseService.createAdminAuthClient();
    const { error: updateError } = await adminClient.auth.admin.updateUserById(
      userId,
      { password: dto.new_password },
    );

    if (updateError) {
      this.logger.error(
        `Error actualizando contraseña: ${updateError.message}`,
      );
      throw new InternalServerErrorException(
        'No se pudo actualizar la contraseña',
      );
    }

    const { error: signOutError } = await adminClient.auth.admin.signOut(
      userId,
      'global',
    );
    if (signOutError) {
      this.logger.warn(
        `No se pudieron invalidar sesiones tras update-password: ${signOutError.message}`,
      );
    }

    this.logger.log(
      `Contraseña actualizada para usuario: ${this.hashUserId(userId)}`,
    );
    return { message: 'Contraseña actualizada correctamente' };
  }

  private hashUserId(userId: string): string {
    return userId.slice(0, 8);
  }
```

(El método `hashUserId` se usa también en Task 11; mantener aquí. Si se duplica luego, mover a un util en una tarea futura.)

- [ ] **Step 6: Pasar `userEmail` al controller**

Editar `presupuestados-back/src/auth/auth.controller.ts`. Reemplazar el método `updatePassword` (líneas ~204-212) por:

```ts
  @Put('update-password')
  @RateLimit('passwordUpdate')
  @HttpCode(HttpStatus.OK)
  @UseGuards(AuthGuard)
  updatePassword(
    @Body() dto: UpdatePasswordDto,
    @Req() req: Request & { user: AuthenticatedUser },
    @Res({ passthrough: true }) res: Response,
  ) {
    clearAuthCookies(res);
    return this.authService.updatePassword(req.user.id, req.user.email, dto);
  }
```

Nota: tras cambio de password, las cookies de la sesión actual ya no son válidas (`signOut('global')`), así que las limpiamos.

- [ ] **Step 7: Agregar vars al `.env.example`**

Agregar al final de `presupuestados-back/.env.example`:

```
RATE_LIMIT_PASSWORD_UPDATE_WINDOW_SECONDS=900
RATE_LIMIT_PASSWORD_UPDATE_USER_MAX=5
RATE_LIMIT_PASSWORD_UPDATE_IP_MAX=10
RATE_LIMIT_PASSWORD_UPDATE_COOLDOWN_SECONDS=900
```

- [ ] **Step 8: Type check**

```bash
cd /Users/pedrorozas/personal/presupuestados/presupuestados-back && npx tsc --noEmit
```

Expected: PASS.

- [ ] **Step 9: Smoke test manual**

```bash
npm run start:dev
```

```bash
TOKEN=$(curl -s -X POST http://localhost:3000/auth/login -H "Content-Type: application/json" -d '{"email":"<TU_EMAIL_TEST>","password":"<PASSWORD_ACTUAL>"}' -c cookies.txt | jq -r '.user.id' && cat cookies.txt | grep access_token | awk '{print $7}')

curl -i -X PUT http://localhost:3000/auth/update-password \
  -H "Content-Type: application/json" \
  -b cookies.txt \
  -d '{"current_password":"wrong","new_password":"unaContraseñaLarga123!"}'
```

Expected: HTTP 401 "La contraseña actual no es válida".

```bash
curl -i -X PUT http://localhost:3000/auth/update-password \
  -H "Content-Type: application/json" \
  -b cookies.txt \
  -d '{"current_password":"<PASSWORD_ACTUAL>","new_password":"unaContraseñaLarga123!"}'
```

Expected: HTTP 200 + cookies limpiadas. Después intentar `GET /auth/me` con la misma cookie → 401.

Detener server.

- [ ] **Step 10: Commit**

```bash
git add src/auth/dto/update-password.dto.ts src/auth/auth.service.ts src/auth/auth.controller.ts src/security/security.types.ts src/security/security.constants.ts src/security/rate-limit.service.ts .env.example
git commit -m "fix(auth): require current password and rate-limit on update-password (CVE-equivalent: account takeover via stolen session)"
```

---

### Task 3: Endpoint `POST /auth/reset-password` para flujo de recovery (H1 — flujo email)

**Files:**
- Create: `presupuestados-back/src/auth/dto/reset-password.dto.ts`
- Modify: `presupuestados-back/src/auth/auth.controller.ts`
- Modify: `presupuestados-back/src/auth/auth.service.ts`

**Contexto:** El flujo "olvidé mi contraseña" mandaba al usuario al endpoint `update-password` con el access_token del email. Ahora `update-password` exige la actual; necesitamos un endpoint separado que reciba el `access_token` de recovery y permita setear nueva password sin pedir la actual (porque el usuario no la recuerda). Se mantiene seguro porque el access_token de recovery requiere acceso al email del usuario.

- [ ] **Step 1: Crear DTO**

Crear `presupuestados-back/src/auth/dto/reset-password.dto.ts`:

```ts
import { IsString, MinLength } from 'class-validator';

export class ResetPasswordDto {
  @IsString({ message: 'El access token debe ser un texto' })
  @MinLength(10, { message: 'El access token es requerido' })
  access_token!: string;

  @IsString({ message: 'La nueva contraseña debe ser un texto' })
  @MinLength(12, {
    message: 'La nueva contraseña debe tener al menos 12 caracteres',
  })
  new_password!: string;
}
```

- [ ] **Step 2: Agregar método `resetPassword` en `auth.service.ts`**

Editar `presupuestados-back/src/auth/auth.service.ts`. Agregar import:

```ts
import { ResetPasswordDto } from './dto/reset-password.dto.js';
```

Al final de la clase (antes del `}` final), agregar:

```ts
  async resetPassword(
    dto: ResetPasswordDto,
  ): Promise<{ message: string }> {
    const publicClient = this.supabaseService.createPublicAuthClient();
    const { data: userData, error: getUserError } =
      await publicClient.auth.getUser(dto.access_token);

    if (getUserError || !userData?.user) {
      this.logger.warn(
        `Reset-password rechazado: token inválido (${getUserError?.message ?? 'sin detalle'})`,
      );
      throw new UnauthorizedException('Enlace de recuperación inválido o expirado');
    }

    const userId = userData.user.id;
    const adminClient = this.supabaseService.createAdminAuthClient();
    const { error: updateError } = await adminClient.auth.admin.updateUserById(
      userId,
      { password: dto.new_password },
    );

    if (updateError) {
      this.logger.error(
        `Error en reset-password: ${updateError.message}`,
      );
      throw new InternalServerErrorException('No se pudo actualizar la contraseña');
    }

    const { error: signOutError } = await adminClient.auth.admin.signOut(
      userId,
      'global',
    );
    if (signOutError) {
      this.logger.warn(
        `No se pudieron invalidar sesiones tras reset-password: ${signOutError.message}`,
      );
    }

    this.logger.log(
      `Reset-password completado para usuario ${this.hashUserId(userId)}`,
    );
    return { message: 'Contraseña restablecida correctamente' };
  }
```

- [ ] **Step 3: Agregar endpoint en `auth.controller.ts`**

Editar `presupuestados-back/src/auth/auth.controller.ts`. Agregar import:

```ts
import { ResetPasswordDto } from './dto/reset-password.dto.js';
```

Antes del cierre `}` de la clase, agregar:

```ts
  @Post('reset-password')
  @RateLimit('passwordUpdate')
  @HttpCode(HttpStatus.OK)
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto);
  }
```

- [ ] **Step 4: Type check**

```bash
cd /Users/pedrorozas/personal/presupuestados/presupuestados-back && npx tsc --noEmit
```

Expected: PASS.

- [ ] **Step 5: Smoke test manual con token inválido**

```bash
npm run start:dev
```

```bash
curl -i -X POST http://localhost:3000/auth/reset-password \
  -H "Content-Type: application/json" \
  -d '{"access_token":"not-a-real-token","new_password":"unaContraseñaLarga123!"}'
```

Expected: HTTP 401 "Enlace de recuperación inválido o expirado".

(Test con token real de recovery se hace en Task 4 integrado con frontend.)

Detener server.

- [ ] **Step 6: Commit**

```bash
git add src/auth/dto/reset-password.dto.ts src/auth/auth.service.ts src/auth/auth.controller.ts
git commit -m "feat(auth): add POST /auth/reset-password for email recovery flow"
```

---

### Task 4: Frontend — Bifurcar `UpdatePassword.tsx` y actualizar `auth.api.ts`

**Files:**
- Modify: `presupuestados-web/src/api/types/auth.ts`
- Modify: `presupuestados-web/src/api/auth.api.ts`
- Modify: `presupuestados-web/src/pages/UpdatePassword.tsx`

**Contexto:** El frontend hoy siempre llama `PUT /auth/update-password` con el token de recovery del email. Ahora hay dos endpoints:
- `PUT /auth/update-password` (logged-in): requiere `current_password` + `new_password` y va con cookie.
- `POST /auth/reset-password` (recovery): recibe `access_token` + `new_password`.

La página `UpdatePassword.tsx` debe detectar si vino de un link de recovery (hay `access_token` en URL hash) o si es un usuario logueado cambiando su clave desde "settings", y enrutar al endpoint correcto.

- [ ] **Step 1: Actualizar types**

Editar `presupuestados-web/src/api/types/auth.ts`. Reemplazar:

```ts
export interface UpdatePasswordPayload {
  new_password: string;
}
```

Por:

```ts
export interface UpdatePasswordPayload {
  current_password: string;
  new_password: string;
}

export interface ResetPasswordPayload {
  access_token: string;
  new_password: string;
}
```

Y exportar `ResetPasswordPayload` en el `index.ts` correspondiente. Editar `presupuestados-web/src/api/types/index.ts`, en el bloque `export type {...} from "./auth"`, agregar `ResetPasswordPayload`:

```ts
export type {
  AuthSession,
  AuthUser,
  ForgotPasswordPayload,
  InitializeUserPayload,
  LoginPayload,
  LogoutPayload,
  RefreshSessionPayload,
  RegisterPayload,
  RegisterResponse,
  ResetPasswordPayload,
  UpdatePasswordPayload,
} from "./auth";
```

- [ ] **Step 2: Actualizar `auth.api.ts`**

Editar `presupuestados-web/src/api/auth.api.ts`. Reemplazar el bloque completo por:

```ts
import { apiClient } from "./apiClient";
import type {
  AuthSession,
  AuthUser,
  ForgotPasswordPayload,
  InitializeUserPayload,
  LoginPayload,
  LogoutPayload,
  RefreshSessionPayload,
  RegisterPayload,
  RegisterResponse,
  ResetPasswordPayload,
  UpdatePasswordPayload,
} from "./types";

export const authApi = {
  register: (payload: RegisterPayload): Promise<RegisterResponse> =>
    apiClient.public.post("/auth/register", payload),

  login: (payload: LoginPayload): Promise<AuthSession> =>
    apiClient.public.post("/auth/login", payload),

  refresh: (payload: RefreshSessionPayload = {}): Promise<AuthSession> =>
    apiClient.public.post("/auth/refresh", payload),

  me: (): Promise<AuthUser> => apiClient.get("/auth/me"),

  logout: (payload?: LogoutPayload): Promise<void> =>
    apiClient.post("/auth/logout", payload),

  initialize: (
    payload: InitializeUserPayload,
  ): Promise<{ message: string; coupleId?: string }> =>
    apiClient.post("/auth/initialize", payload),

  forgotPassword: (payload: ForgotPasswordPayload): Promise<void> =>
    apiClient.public.post("/auth/forgot-password", payload),

  updatePassword: (payload: UpdatePasswordPayload): Promise<void> =>
    apiClient.put("/auth/update-password", payload),

  resetPassword: (payload: ResetPasswordPayload): Promise<void> =>
    apiClient.public.post("/auth/reset-password", payload),
};
```

- [ ] **Step 3: Reescribir `UpdatePassword.tsx`**

Sobrescribir `presupuestados-web/src/pages/UpdatePassword.tsx`. Mantiene el mismo look-and-feel (no rehacer estilos), pero:
- Si hay `access_token` en hash/query → modo "recovery" (no pide current_password, usa `authApi.resetPassword`).
- Si no hay token → modo "logged-in" (pide current_password, usa `authApi.updatePassword`).

```tsx
import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  Box,
  Paper,
  Typography,
  TextField,
  Button,
  Alert,
  CircularProgress,
  InputAdornment,
  IconButton,
  Container,
  Fade,
} from "@mui/material";
import {
  Lock as LockIcon,
  Visibility,
  VisibilityOff,
  VpnKey as KeyIcon,
} from "@mui/icons-material";
import { authApi } from "../api";
import { SEO } from "../components/SEO";

const MIN_PASSWORD_LENGTH = 12;

type Mode = "recovery" | "loggedIn";

export const UpdatePassword: React.FC = () => {
  const navigate = useNavigate();
  const [mode, setMode] = useState<Mode>("loggedIn");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [recoveryToken, setRecoveryToken] = useState<string | null>(null);
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  useEffect(() => {
    const hashParams = new URLSearchParams(
      window.location.hash
        .replace(/^#\/?update-password&?/, "")
        .replace(/^#/, ""),
    );
    const searchParams = new URLSearchParams(window.location.search);
    const accessToken =
      hashParams.get("access_token") || searchParams.get("access_token");

    if (accessToken) {
      setRecoveryToken(accessToken);
      setMode("recovery");
      window.history.replaceState(null, "", "/update-password");
    }
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage(null);

    try {
      if (newPassword.length < MIN_PASSWORD_LENGTH) {
        throw new Error(
          `La nueva contraseña debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres.`,
        );
      }

      if (mode === "recovery") {
        if (!recoveryToken) {
          throw new Error("El enlace de recuperación no es válido o expiró.");
        }
        await authApi.resetPassword({
          access_token: recoveryToken,
          new_password: newPassword,
        });
      } else {
        if (!currentPassword) {
          throw new Error("Ingresa tu contraseña actual.");
        }
        await authApi.updatePassword({
          current_password: currentPassword,
          new_password: newPassword,
        });
      }

      setRecoveryToken(null);
      setMessage({
        type: "success",
        text:
          mode === "recovery"
            ? "Contraseña restablecida correctamente. Redirigiendo..."
            : "Contraseña actualizada correctamente. Volverás a iniciar sesión.",
      });

      setTimeout(() => {
        navigate("/login");
      }, 2000);
    } catch (error: unknown) {
      const errMsg =
        error instanceof Error ? error.message : "Error al actualizar la contraseña.";
      setMessage({ type: "error", text: errMsg });
    } finally {
      setLoading(false);
    }
  };

  const inputSx = {
    "& .MuiOutlinedInput-root": {
      borderRadius: "16px",
      backgroundColor: "rgba(255, 255, 255, 0.5)",
      backdropFilter: "blur(8px)",
      transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
      "& fieldset": {
        borderColor: "rgba(255, 255, 255, 0.3)",
        borderWidth: "1px",
      },
      "&:hover": {
        backgroundColor: "rgba(255, 255, 255, 0.7)",
      },
      "&:hover fieldset": {
        borderColor: "rgba(99, 102, 241, 0.6)",
      },
      "&.Mui-focused": {
        backgroundColor: "#ffffff",
        transform: "translateY(-2px)",
        boxShadow:
          "0 10px 20px -5px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)",
        "& fieldset": {
          borderColor: "#4f46e5",
          borderWidth: "2px",
        },
      },
    },
  };

  return (
    <Box className="min-h-screen w-full flex items-center justify-center bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 relative overflow-hidden">
      <SEO
        title="Actualizar contraseña"
        description="Actualiza la contraseña de tu cuenta de PresupuestaDos."
        canonicalPath="/update-password"
        noIndex
      />
      <Container maxWidth="sm" className="relative z-10 p-4">
        <Fade in={true} timeout={1000}>
          <Box>
            <Paper
              elevation={24}
              className="overflow-hidden backdrop-blur-xl border border-white/30"
              sx={{
                borderRadius: "32px",
                background: "rgba(255, 255, 255, 0.85)",
                boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.5)",
              }}
            >
              <Box className="p-8 md:p-12">
                <Box className="flex flex-col items-center text-center mb-8">
                  <Box className="w-16 h-16 bg-gradient-to-tr from-emerald-600 to-orange-500 rounded-2xl flex items-center justify-center shadow-xl shadow-emerald-500/30 mb-4">
                    <KeyIcon className="text-white text-4xl" />
                  </Box>
                  <Typography variant="h4" className="font-extrabold text-gray-900 mb-1 tracking-tight">
                    {mode === "recovery" ? "Restablecer contraseña" : "Cambiar contraseña"}
                  </Typography>
                  <Typography variant="body1" className="text-gray-500 font-medium">
                    {mode === "recovery"
                      ? "Define una nueva contraseña para tu cuenta"
                      : "Confirma tu contraseña actual e ingresa la nueva"}
                  </Typography>
                </Box>

                {message && (
                  <Alert severity={message.type} className="mb-6 rounded-xl shadow-sm font-medium">
                    {message.text}
                  </Alert>
                )}

                <form onSubmit={handleSubmit} className="flex flex-col gap-5">
                  {mode === "loggedIn" && (
                    <Box>
                      <Typography variant="caption" className="ml-3 mb-1.5 block font-bold text-slate-600 tracking-wide text-xs uppercase">
                        Contraseña actual
                      </Typography>
                      <TextField
                        type={showCurrentPassword ? "text" : "password"}
                        placeholder="********"
                        fullWidth
                        required
                        value={currentPassword}
                        onChange={(e) => setCurrentPassword(e.target.value)}
                        InputProps={{
                          startAdornment: (
                            <InputAdornment position="start">
                              <LockIcon className="text-emerald-400 ml-1" />
                            </InputAdornment>
                          ),
                          endAdornment: (
                            <InputAdornment position="end">
                              <IconButton
                                onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                                edge="end"
                                className="mr-1"
                              >
                                {showCurrentPassword ? (
                                  <VisibilityOff className="text-gray-400" />
                                ) : (
                                  <Visibility className="text-gray-400" />
                                )}
                              </IconButton>
                            </InputAdornment>
                          ),
                        }}
                        sx={inputSx}
                      />
                    </Box>
                  )}

                  <Box>
                    <Typography variant="caption" className="ml-3 mb-1.5 block font-bold text-slate-600 tracking-wide text-xs uppercase">
                      Nueva contraseña
                    </Typography>
                    <TextField
                      type={showNewPassword ? "text" : "password"}
                      placeholder="********"
                      fullWidth
                      required
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      InputProps={{
                        startAdornment: (
                          <InputAdornment position="start">
                            <LockIcon className="text-emerald-400 ml-1" />
                          </InputAdornment>
                        ),
                        endAdornment: (
                          <InputAdornment position="end">
                            <IconButton
                              onClick={() => setShowNewPassword(!showNewPassword)}
                              edge="end"
                              className="mr-1"
                            >
                              {showNewPassword ? (
                                <VisibilityOff className="text-gray-400" />
                              ) : (
                                <Visibility className="text-gray-400" />
                              )}
                            </IconButton>
                          </InputAdornment>
                        ),
                      }}
                      helperText={`Mínimo ${MIN_PASSWORD_LENGTH} caracteres`}
                      sx={inputSx}
                    />
                  </Box>

                  <Button
                    type="submit"
                    variant="contained"
                    size="large"
                    fullWidth
                    disabled={loading}
                    className="py-4 mt-2 text-lg font-bold rounded-2xl shadow-xl shadow-emerald-500/30"
                    sx={{
                      background:
                        "linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)",
                      textTransform: "none",
                      "&:hover": {
                        background:
                          "linear-gradient(135deg, #4338ca 0%, #6d28d9 100%)",
                      },
                    }}
                  >
                    {loading ? (
                      <CircularProgress size={26} color="inherit" />
                    ) : mode === "recovery" ? (
                      "Restablecer contraseña"
                    ) : (
                      "Actualizar contraseña"
                    )}
                  </Button>
                </form>
              </Box>
            </Paper>
          </Box>
        </Fade>
      </Container>
    </Box>
  );
};
```

- [ ] **Step 4: Type check frontend**

```bash
cd /Users/pedrorozas/personal/presupuestados/presupuestados-web && npx tsc --noEmit
```

Expected: PASS.

- [ ] **Step 5: Smoke test E2E**

Arrancar back y front:
```bash
cd /Users/pedrorozas/personal/presupuestados/presupuestados-back && npm run start:dev &
cd /Users/pedrorozas/personal/presupuestados/presupuestados-web && npm run dev
```

Probar (manual en browser):
1. Login normal → ir a `/update-password` sin token → debe pedir contraseña actual. Ingresar actual + nueva (≥12 chars) → éxito → redirige a `/login` → al loguearse, la nueva pass funciona.
2. Olvidé contraseña → recibir email → click → URL termina con `#access_token=...` → la página debe ocultar el campo "contraseña actual" y aceptar sólo la nueva → éxito.

Si ambos flujos funcionan: OK.

- [ ] **Step 6: Commit (front)**

```bash
cd /Users/pedrorozas/personal/presupuestados/presupuestados-web
git add src/api/auth.api.ts src/api/types/auth.ts src/api/types/index.ts src/pages/UpdatePassword.tsx
git commit -m "feat(auth): split update-password and reset-password flows in UI"
```

---

## Fase 2 — Medium Severity

### Task 5: Eliminar oráculo de enumeración de emails en `/auth/register` (M2)

**Files:**
- Modify: `presupuestados-back/src/auth/auth.service.ts`

**Contexto:** El método `register()` hace un lookup de hasta 5000 usuarios por registro y devuelve códigos distintos (`EMAIL_ALREADY_REGISTERED`, `EMAIL_PENDING_CONFIRMATION`) según exista o no el email. Eso es un oráculo de enumeración. Hay que quitar el lookup y devolver respuesta genérica siempre.

- [ ] **Step 1: Reescribir `register()` y borrar fallbacks**

Editar `presupuestados-back/src/auth/auth.service.ts`. Reemplazar todo el método `register()` (líneas ~61-121) por:

```ts
  async register(dto: RegisterDto): Promise<RegisterResponse> {
    const email = this.normalizeEmail(dto.email);
    const fullName = dto.full_name.trim();
    const inviteCode = this.normalizeInviteCode(dto.invite_code);

    this.logger.log(
      `Solicitud de registro recibida (hash=${this.securityEventsService.hashIdentifier(email)})`,
    );

    await this.assertInviteCodeCanBeUsedForRegistration(inviteCode);

    const authClient = this.supabaseService.createPublicAuthClient();
    const { data, error } = await authClient.auth.signUp({
      email,
      password: dto.password,
      options: {
        data: {
          full_name: fullName,
          invite_code: inviteCode,
        },
      },
    });

    if (error) {
      this.logger.error(`Error en signUp: ${error.message}`);
      throw new InternalServerErrorException(
        'No se pudo procesar el registro. Inténtalo más tarde.',
      );
    }

    if (data.user && data.user.identities?.length === 0) {
      this.logger.log(
        'Registro de email ya existente: reenviando confirmación de forma silenciosa',
      );
      const resendClient = this.supabaseService.createPublicAuthClient();
      await resendClient.auth.resend({ type: 'signup', email });
    }

    return {
      message:
        'Si el correo no estaba registrado, recibirás un email para confirmar tu cuenta.',
      emailConfirmationRequired: true,
      user: {
        id: data.user?.id ?? 'pending',
        email,
      },
    };
  }
```

Y borrar los métodos privados que dejan de usarse:
- `findAuthUserByEmail` (líneas ~342-367)
- `findProfileAuthFallback` (líneas ~369-390)
- `throwEmailAlreadyRegistered` (líneas ~392-406)
- `isAlreadyRegisteredError` (líneas ~337-340)

Limpiar el import de `User` si ya no se usa en ningún otro lado del archivo (`import type { User } from '@supabase/supabase-js';`). Verificar con `grep -n "User" src/auth/auth.service.ts` y eliminar el import si no aparece en otros métodos.

- [ ] **Step 2: Verificar tests existentes**

```bash
cd /Users/pedrorozas/personal/presupuestados/presupuestados-back && npx jest src/auth/auth.service.spec.ts
```

Si hay tests que esperan `EMAIL_ALREADY_REGISTERED` o `EMAIL_PENDING_CONFIRMATION`, hay que actualizarlos. Buscar:

```bash
grep -n "EMAIL_ALREADY_REGISTERED\|EMAIL_PENDING_CONFIRMATION\|findAuthUserByEmail" src/auth/auth.service.spec.ts
```

Para cada test que falle, ajustar la expectativa a: el endpoint devuelve siempre `200/201` con `message: 'Si el correo no estaba registrado...'`. Si no se puede preservar la intención del test, eliminar el test (el comportamiento testeado ya no existe).

- [ ] **Step 3: Type check + tests**

```bash
npx tsc --noEmit
npm test -- --runInBand
```

Expected: PASS.

- [ ] **Step 4: Smoke test manual**

```bash
npm run start:dev
```

```bash
curl -i -X POST http://localhost:3000/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"<EMAIL_YA_REGISTRADO>","password":"unaContraseñaLarga123!","full_name":"Test"}'
```

Expected: HTTP 201 + body `{ "message": "Si el correo no estaba registrado..." }`. Igual respuesta para email nuevo. Detener server.

- [ ] **Step 5: Commit**

```bash
git add src/auth/auth.service.ts src/auth/auth.service.spec.ts 2>/dev/null
git commit -m "fix(auth): remove email enumeration oracle from /auth/register"
```

---

### Task 6: Política de password mínimo 12 caracteres (M3)

**Files:**
- Modify: `presupuestados-back/src/auth/dto/register.dto.ts`

**Contexto:** El registro permite passwords de 6 caracteres. La regla nueva: registro y reset/update piden mínimo 12 (UpdatePasswordDto y ResetPasswordDto ya están en 12 desde Task 2 y 3). Solo falta register. Login se mantiene flexible (no romper cuentas con passwords viejas cortas; el server no aplica MinLength en login).

- [ ] **Step 1: Editar `register.dto.ts`**

Editar `presupuestados-back/src/auth/dto/register.dto.ts`, reemplazar:

```ts
  @IsString({ message: 'La contraseña debe ser un texto' })
  @MinLength(6, { message: 'La contraseña debe tener al menos 6 caracteres' })
  @IsNotEmpty({ message: 'La contraseña es requerida' })
  password!: string;
```

Por:

```ts
  @IsString({ message: 'La contraseña debe ser un texto' })
  @MinLength(12, { message: 'La contraseña debe tener al menos 12 caracteres' })
  @IsNotEmpty({ message: 'La contraseña es requerida' })
  password!: string;
```

- [ ] **Step 2: Actualizar `login.dto.ts` si tiene MinLength(6)**

Leer `presupuestados-back/src/auth/dto/login.dto.ts` para confirmar; si tiene `MinLength(6)` con mensaje específico, **dejarlo** (no romper logins de cuentas con passwords cortas viejas). Solo si tiene un mensaje engañoso del estilo "min 12", reemplazarlo por `MinLength(1)`.

- [ ] **Step 3: Type check + tests**

```bash
npx tsc --noEmit && npm test -- --runInBand
```

Si tests de register hardcodean password de 6 chars, actualizarlos a 12 chars.

- [ ] **Step 4: Commit**

```bash
git add src/auth/dto/register.dto.ts src/auth/auth.service.spec.ts 2>/dev/null
git commit -m "fix(auth): require min 12 chars for registration password"
```

---

### Task 7: Normalizar email en partner-requests (M4)

**Files:**
- Modify: `presupuestados-back/src/partner-requests/dto/send-invite.dto.ts`
- Modify: `presupuestados-back/src/partner-requests/partner-requests.service.ts`

**Contexto:** `sendInvite` guarda `receiverEmail` tal cual viene, pero `acceptInvite` compara contra `userEmail.toLowerCase()`. Si A invita a `JUAN@x.com` y Juan se registra como `juan@x.com`, el invite no matchea. Solución: normalizar siempre a lowercase en el DTO con `@Transform`.

- [ ] **Step 1: Editar el DTO**

Sobrescribir `presupuestados-back/src/partner-requests/dto/send-invite.dto.ts`:

```ts
import { IsEmail, IsNotEmpty } from 'class-validator';
import { Transform } from 'class-transformer';

export class SendInviteDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsEmail({}, { message: 'El email del receptor no es válido' })
  @IsNotEmpty({ message: 'El email del receptor no puede estar vacío' })
  receiver_email!: string;
}
```

- [ ] **Step 2: Verificar service**

El `acceptInvite` ya hace `userEmail.toLowerCase()` antes de comparar (línea 119). No requiere cambios. Verificar:

```bash
grep -n "receiverEmail\|userEmail" src/partner-requests/partner-requests.service.ts
```

Confirmar que en `sendInvite` no se hace una comparación case-sensitive en `existing` con un email no normalizado (línea 51). Como ahora el DTO ya viene en lowercase, el campo `receiver_email` siempre será lowercase, y el chequeo `eq(partnerRequests.receiverEmail, receiverEmail)` se mantiene consistente.

- [ ] **Step 3: Type check**

```bash
npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add src/partner-requests/dto/send-invite.dto.ts
git commit -m "fix(partner-requests): normalize receiver_email to lowercase to avoid case-mismatch bypass"
```

---

### Task 8: Validar `avatar_url` y `phone` en profile (M5)

**Files:**
- Modify: `presupuestados-back/src/profiles/dto/update-profile.dto.ts`

**Contexto:** `avatar_url` y `phone` son `IsString` libres → permite `javascript:`, `data:`, payloads XSS si se renderiza luego. Aplicar validación estricta.

- [ ] **Step 1: Sobrescribir el DTO**

Sobrescribir `presupuestados-back/src/profiles/dto/update-profile.dto.ts`:

```ts
import {
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  IsUrl,
  Matches,
  MaxLength,
} from 'class-validator';

const ALLOWED_SPLIT_METHODS = ['EQUAL', 'PROPORTIONAL', 'CUSTOM'] as const;

export class UpdateProfileDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  full_name?: string;

  @IsOptional()
  @IsUrl(
    { protocols: ['https'], require_protocol: true },
    { message: 'avatar_url debe ser una URL https válida' },
  )
  @MaxLength(2048)
  avatar_url?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\+?[0-9\s()-]{6,20}$/, {
    message: 'phone debe tener entre 6 y 20 caracteres y solo dígitos, +, espacios, paréntesis o guiones',
  })
  phone?: string;

  @IsOptional()
  @IsIn(ALLOWED_SPLIT_METHODS, {
    message: 'default_split_method inválido',
  })
  default_split_method?: (typeof ALLOWED_SPLIT_METHODS)[number];

  @IsOptional()
  @IsBoolean()
  has_seen_onboarding?: boolean;
}
```

Nota: verificar los valores reales que el frontend manda como `default_split_method`. Si usa otros (ej. `EQUAL_50_50`, `PROPORTIONAL_TO_INCOME`), ajustar `ALLOWED_SPLIT_METHODS` a esos valores. Buscar con:

```bash
grep -rn "default_split_method\|defaultSplitMethod" /Users/pedrorozas/personal/presupuestados/presupuestados-web/src | grep -i "set\|update\|payload" | head -20
```

Adaptar el array `ALLOWED_SPLIT_METHODS` a los strings que realmente envía el front.

- [ ] **Step 2: Type check + tests**

```bash
npx tsc --noEmit && npm test -- --runInBand
```

- [ ] **Step 3: Smoke test manual**

```bash
npm run start:dev
```

```bash
curl -i -X PUT http://localhost:3000/profiles/me \
  -b cookies.txt \
  -H "Content-Type: application/json" \
  -d '{"avatar_url":"javascript:alert(1)"}'
```

Expected: HTTP 400 con error de validación.

```bash
curl -i -X PUT http://localhost:3000/profiles/me \
  -b cookies.txt \
  -H "Content-Type: application/json" \
  -d '{"avatar_url":"https://cdn.example.com/avatars/u123.png"}'
```

Expected: HTTP 200.

- [ ] **Step 4: Commit**

```bash
git add src/profiles/dto/update-profile.dto.ts
git commit -m "fix(profiles): validate avatar_url as https-only and phone format"
```

---

### Task 9: Headers de seguridad en `vercel.json` (M6)

**Files:**
- Modify: `presupuestados-web/vercel.json`

**Contexto:** El frontend no tiene CSP, HSTS, X-Frame-Options ni Permissions-Policy. Agregarlos.

- [ ] **Step 1: Identificar el origin del API en producción**

Buscar en el código frontend:

```bash
grep -rn "presu-api\|VITE_API_URL\|apiBaseUrl" /Users/pedrorozas/personal/presupuestados/presupuestados-web/src/api/apiClient.ts /Users/pedrorozas/personal/presupuestados/presupuestados-web/.env* 2>/dev/null
```

Anotar la URL del backend en prod (ej. `https://presu-api.presupuestados.cl`). Si no aparece y `.env.production` no existe, preguntar al usuario o usar `https://presu-api.presupuestados.cl` como placeholder y documentarlo.

- [ ] **Step 2: Sobrescribir `vercel.json`**

Sobrescribir `presupuestados-web/vercel.json` (reemplazando `<API_ORIGIN>` por la URL identificada en Step 1):

```json
{
  "redirects": [
    {
      "source": "/guest",
      "destination": "/",
      "permanent": true
    }
  ],
  "headers": [
    {
      "source": "/(.*)",
      "headers": [
        {
          "key": "Content-Security-Policy",
          "value": "default-src 'self'; script-src 'self' 'unsafe-inline' https://us.i.posthog.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; img-src 'self' data: https:; connect-src 'self' https://us.i.posthog.com <API_ORIGIN>; font-src 'self' https://fonts.gstatic.com data:; frame-ancestors 'none'; base-uri 'self'; form-action 'self'"
        },
        {
          "key": "Strict-Transport-Security",
          "value": "max-age=31536000; includeSubDomains; preload"
        },
        {
          "key": "X-Frame-Options",
          "value": "DENY"
        },
        {
          "key": "X-Content-Type-Options",
          "value": "nosniff"
        },
        {
          "key": "Referrer-Policy",
          "value": "strict-origin-when-cross-origin"
        },
        {
          "key": "Permissions-Policy",
          "value": "camera=(), microphone=(), geolocation=(), interest-cohort=()"
        }
      ]
    },
    {
      "source": "/login",
      "headers": [
        {
          "key": "X-Robots-Tag",
          "value": "noindex, nofollow"
        }
      ]
    },
    {
      "source": "/update-password",
      "headers": [
        {
          "key": "X-Robots-Tag",
          "value": "noindex, nofollow"
        }
      ]
    },
    {
      "source": "/dashboard",
      "headers": [
        {
          "key": "X-Robots-Tag",
          "value": "noindex, nofollow"
        }
      ]
    }
  ],
  "rewrites": [
    {
      "source": "/((?!robots.txt|sitemap.xml|logo.png|assets/).*)",
      "destination": "/index.html"
    }
  ]
}
```

- [ ] **Step 3: Test local de validez JSON**

```bash
cd /Users/pedrorozas/personal/presupuestados/presupuestados-web
node -e "JSON.parse(require('fs').readFileSync('vercel.json','utf8')); console.log('OK')"
```

Expected: `OK`.

- [ ] **Step 4: Documentar prueba en preview deploy**

Agregar nota al PR (o al CHANGELOG): "Verificar en preview deploy que la app carga sin errores CSP en consola del browser, especialmente PostHog, fonts y llamadas al API."

- [ ] **Step 5: Commit**

```bash
git add vercel.json
git commit -m "feat(security): add CSP, HSTS and security headers via Vercel"
```

---

### Task 10: Rate-limits adicionales (M1)

**Files:**
- Modify: `presupuestados-back/src/auth/auth.controller.ts`
- Modify: `presupuestados-back/src/couples/couples.controller.ts`
- Modify: `presupuestados-back/src/partner-requests/partner-requests.controller.ts`
- Modify: `presupuestados-back/src/security/security.types.ts`
- Modify: `presupuestados-back/src/security/security.constants.ts`
- Modify: `presupuestados-back/src/security/rate-limit.service.ts`
- Modify: `presupuestados-back/.env.example`

**Contexto:** `POST /auth/initialize`, `POST /couples/join` y `POST /partner-requests` no tienen rate-limit dedicado, solo el global. Agregar políticas específicas.

- [ ] **Step 1: Agregar políticas a `security.types.ts`**

Editar `presupuestados-back/src/security/security.types.ts`. Reemplazar el bloque `RateLimitPolicy` y `RateLimitScope`:

```ts
export type RateLimitPolicy =
  | 'authLogin'
  | 'authRegister'
  | 'passwordReset'
  | 'passwordUpdate'
  | 'authRefresh'
  | 'authInitialize'
  | 'coupleJoin'
  | 'partnerInvite'
  | 'chatbot'
  | 'ai';

export type RateLimitScope =
  | 'global'
  | 'auth_login'
  | 'auth_register'
  | 'password_reset'
  | 'password_update'
  | 'auth_refresh'
  | 'auth_initialize'
  | 'couple_join'
  | 'partner_invite'
  | 'chatbot'
  | 'ai';
```

- [ ] **Step 2: Agregar defaults a `security.constants.ts`**

Agregar al objeto `DEFAULT_RATE_LIMITS` (antes del `} as const;`):

```ts
  authInitializeWindowSeconds: 3600,
  authInitializeUserMax: 10,
  coupleJoinWindowSeconds: 900,
  coupleJoinUserMax: 5,
  coupleJoinIpMax: 10,
  partnerInviteWindowSeconds: 3600,
  partnerInviteUserMax: 10,
```

- [ ] **Step 3: Agregar reglas en `rate-limit.service.ts`**

Editar `presupuestados-back/src/security/rate-limit.service.ts`. Agregar dentro del `switch (policy)` de `getPolicyRules`, antes de `case 'chatbot':`:

```ts
      case 'authInitialize':
        return [
          {
            scope: 'auth_initialize',
            routeKey: 'auth:initialize',
            identity: 'user',
            windowSeconds: this.getNumber(
              'RATE_LIMIT_AUTH_INITIALIZE_WINDOW_SECONDS',
              DEFAULT_RATE_LIMITS.authInitializeWindowSeconds,
            ),
            max: this.getNumber(
              'RATE_LIMIT_AUTH_INITIALIZE_USER_MAX',
              DEFAULT_RATE_LIMITS.authInitializeUserMax,
            ),
            eventType: 'rate_limit_exceeded',
          },
        ];
      case 'coupleJoin':
        return [
          {
            scope: 'couple_join',
            routeKey: 'couples:join',
            identity: 'user',
            windowSeconds: this.getNumber(
              'RATE_LIMIT_COUPLE_JOIN_WINDOW_SECONDS',
              DEFAULT_RATE_LIMITS.coupleJoinWindowSeconds,
            ),
            max: this.getNumber(
              'RATE_LIMIT_COUPLE_JOIN_USER_MAX',
              DEFAULT_RATE_LIMITS.coupleJoinUserMax,
            ),
            eventType: 'rate_limit_exceeded',
          },
          {
            scope: 'couple_join',
            routeKey: 'couples:join',
            identity: 'ip',
            windowSeconds: this.getNumber(
              'RATE_LIMIT_COUPLE_JOIN_WINDOW_SECONDS',
              DEFAULT_RATE_LIMITS.coupleJoinWindowSeconds,
            ),
            max: this.getNumber(
              'RATE_LIMIT_COUPLE_JOIN_IP_MAX',
              DEFAULT_RATE_LIMITS.coupleJoinIpMax,
            ),
            eventType: 'rate_limit_exceeded',
          },
        ];
      case 'partnerInvite':
        return [
          {
            scope: 'partner_invite',
            routeKey: 'partner-requests:send',
            identity: 'user',
            windowSeconds: this.getNumber(
              'RATE_LIMIT_PARTNER_INVITE_WINDOW_SECONDS',
              DEFAULT_RATE_LIMITS.partnerInviteWindowSeconds,
            ),
            max: this.getNumber(
              'RATE_LIMIT_PARTNER_INVITE_USER_MAX',
              DEFAULT_RATE_LIMITS.partnerInviteUserMax,
            ),
            eventType: 'rate_limit_exceeded',
          },
        ];
```

- [ ] **Step 4: Anotar controllers**

Editar `presupuestados-back/src/auth/auth.controller.ts`. Decorar `initializeUserData` agregando `@RateLimit('authInitialize')` antes de `@UseGuards(AuthGuard)`:

```ts
  @Post('initialize')
  @RateLimit('authInitialize')
  @HttpCode(HttpStatus.OK)
  @UseGuards(AuthGuard)
  initializeUserData(
    @Body() dto: InitializeUserDto,
    @Req() req: Request & { user: AuthenticatedUser },
  ): Promise<{ message: string; coupleId?: string }> {
    return this.authService.initializeUserData(req.user.id, dto);
  }
```

Editar `presupuestados-back/src/couples/couples.controller.ts`. Agregar import:

```ts
import { RateLimit } from '../security/decorators/rate-limit.decorator.js';
```

Decorar `joinCouple`:

```ts
  @Post('join')
  @RateLimit('coupleJoin')
  @UseGuards(AuthGuard)
  async joinCouple(
    @Body() dto: JoinCoupleDto,
    @Req() req: Request & { user: AuthenticatedUser },
  ): Promise<{ message: string }> {
    return this.couplesService.joinCouple(req.user.id, dto.p_code);
  }
```

Editar `presupuestados-back/src/partner-requests/partner-requests.controller.ts`. Agregar import:

```ts
import { RateLimit } from '../security/decorators/rate-limit.decorator.js';
```

Decorar `sendInvite`:

```ts
  @Post()
  @RateLimit('partnerInvite')
  async sendInvite(
    @Body() dto: SendInviteDto,
    @Req() req: Request & { user: AuthenticatedUser },
  ): Promise<{ success: boolean }> {
    return this.partnerRequestsService.sendInvite(
      req.user.id,
      dto.receiver_email,
    );
  }
```

- [ ] **Step 5: Agregar vars a `.env.example`**

Agregar al final de `presupuestados-back/.env.example`:

```
RATE_LIMIT_AUTH_INITIALIZE_WINDOW_SECONDS=3600
RATE_LIMIT_AUTH_INITIALIZE_USER_MAX=10
RATE_LIMIT_COUPLE_JOIN_WINDOW_SECONDS=900
RATE_LIMIT_COUPLE_JOIN_USER_MAX=5
RATE_LIMIT_COUPLE_JOIN_IP_MAX=10
RATE_LIMIT_PARTNER_INVITE_WINDOW_SECONDS=3600
RATE_LIMIT_PARTNER_INVITE_USER_MAX=10
```

- [ ] **Step 6: Type check + tests**

```bash
npx tsc --noEmit && npm test -- --runInBand
```

- [ ] **Step 7: Commit**

```bash
git add src/auth/auth.controller.ts src/couples/couples.controller.ts src/partner-requests/partner-requests.controller.ts src/security/security.types.ts src/security/security.constants.ts src/security/rate-limit.service.ts .env.example
git commit -m "feat(security): add rate-limits to initialize, couples/join and partner-requests"
```

---

## Fase 3 — Low Severity & Hardening

### Task 11: Logout correcto (L1)

**Files:**
- Modify: `presupuestados-back/src/auth/auth.controller.ts`
- Modify: `presupuestados-back/src/auth/auth.service.ts`

**Contexto:** `clearAuthCookies` se llama antes que `logout()` (si falla, queda sin cookies pero el token sigue válido en otros lados). Y `admin.signOut(token)` revoca todas las sesiones del usuario en todos los dispositivos en vez de solo la actual.

- [ ] **Step 1: Cambiar orden y scope en controller**

Editar `presupuestados-back/src/auth/auth.controller.ts`. Reemplazar el método `logout` (líneas ~136-147):

```ts
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @UseGuards(AuthGuard)
  async logout(
    @Req() req: Request & { user: AuthenticatedUser },
    @Res({ passthrough: true }) res: Response,
  ) {
    const token =
      getBearerToken(req) ?? getCookie(req, ACCESS_TOKEN_COOKIE) ?? '';
    try {
      return await this.authService.logout(token);
    } finally {
      clearAuthCookies(res);
    }
  }
```

- [ ] **Step 2: Cambiar scope en service**

Editar `presupuestados-back/src/auth/auth.service.ts`. Reemplazar `logout()` (líneas ~423-439):

```ts
  async logout(accessToken: string): Promise<{ message: string }> {
    if (!accessToken) {
      return { message: 'Sesión cerrada' };
    }

    this.logger.log('Cerrando sesión (scope=local)');
    const supabase = this.supabaseService.createAdminAuthClient();
    const { error } = await supabase.auth.admin.signOut(accessToken, 'local');

    if (error) {
      this.logger.warn(`Error en logout: ${error.message}`);
      return { message: 'Sesión cerrada (con advertencias)' };
    }

    return { message: 'Sesión cerrada correctamente' };
  }
```

Notas:
- Si no hay token, no fallar (idempotente).
- Si Supabase falla, no lanzar 500: el cliente ya viene a desloguearse, ya limpiamos cookies, devolver 200 con mensaje suave.

- [ ] **Step 3: Type check + tests**

```bash
npx tsc --noEmit && npm test -- --runInBand
```

- [ ] **Step 4: Commit**

```bash
git add src/auth/auth.controller.ts src/auth/auth.service.ts
git commit -m "fix(auth): clear cookies after logout and limit signOut to current session"
```

---

### Task 12: Hash de emails y user IDs en logs (L2)

**Files:**
- Modify: `presupuestados-back/src/auth/auth.service.ts`

**Contexto:** `this.logger.log("Intento de login para: ${email}")` filtra PII. Reemplazar por hash mediante `securityEventsService.hashIdentifier`.

- [ ] **Step 1: Reemplazar logs con email plano**

En `presupuestados-back/src/auth/auth.service.ts`, hacer estas sustituciones puntuales (cada una con Edit):

Línea ~131:
```ts
    this.logger.log(`Intento de login para: ${email}`);
```
→
```ts
    this.logger.log(
      `Intento de login (email_hash=${this.securityEventsService.hashIdentifier(email)})`,
    );
```

Línea ~140 (mensaje de fallo):
```ts
      this.logger.warn(`Login fallido para ${email}: ${error?.message}`);
```
→
```ts
      this.logger.warn(
        `Login fallido (email_hash=${this.securityEventsService.hashIdentifier(email)}): ${error?.message}`,
      );
```

Línea ~154:
```ts
      this.logger.warn(`Login bloqueado para ${email}: email no confirmado`);
```
→
```ts
      this.logger.warn(
        `Login bloqueado (email_hash=${this.securityEventsService.hashIdentifier(email)}): email no confirmado`,
      );
```

Línea ~621 en `forgotPassword`:
```ts
    this.logger.log(`Solicitud de recuperación para: ${email}`);
```
→
```ts
    this.logger.log(
      `Solicitud de recuperación (email_hash=${this.securityEventsService.hashIdentifier(email)})`,
    );
```

Línea ~691 en `resendConfirmation`:
```ts
      this.logger.warn(
        `No se pudo reenviar confirmación a ${email}: ${error.message}`,
      );
```
→
```ts
      this.logger.warn(
        `No se pudo reenviar confirmación (email_hash=${this.securityEventsService.hashIdentifier(email)}): ${error.message}`,
      );
```

`Registrando nuevo usuario: ${email}` ya quedó eliminado en Task 5.

`Usuario registrado, pendiente de confirmación: ${data.user.id}` (línea ~109) — userId no es PII tan sensible como email pero igual reemplazar:
```ts
    this.logger.log(
      `Usuario registrado, pendiente de confirmación: ${data.user.id.slice(0, 8)}`,
    );
```

(Si Task 5 ya borró este log porque reemplazó el método, omitir este sub-paso.)

- [ ] **Step 2: Inyectar `RateLimitService` en `AuthService` para usar `hashIdentifier`**

`RateLimitService.hashIdentifier` ya existe y es público. Para no duplicarlo, inyectar el servicio en `AuthService`.

Editar `presupuestados-back/src/auth/auth.service.ts`. Agregar import:

```ts
import { RateLimitService } from '../security/rate-limit.service.js';
```

Modificar el constructor:

```ts
  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly couplesService: CouplesService,
    private readonly securityEventsService: SecurityEventsService,
    private readonly rateLimitService: RateLimitService,
  ) {}
```

En los logs reemplazados en Step 1, usar `this.rateLimitService.hashIdentifier(email)` en vez de `this.securityEventsService.hashIdentifier(email)` (si Step 1 escribió `securityEventsService`, cambiarlo).

- [ ] **Step 2b: Asegurar export de `RateLimitService` en `SecurityModule`**

```bash
grep -n "exports\|RateLimitService" /Users/pedrorozas/personal/presupuestados/presupuestados-back/src/security/security.module.ts
```

Si `RateLimitService` no está en el array `exports` del módulo, agregarlo. Y verificar que `AuthModule` importa `SecurityModule`:

```bash
grep -n "SecurityModule" /Users/pedrorozas/personal/presupuestados/presupuestados-back/src/auth/auth.module.ts
```

Si falta el import, agregarlo al array `imports` de `AuthModule`.

- [ ] **Step 3: Type check + tests**

```bash
npx tsc --noEmit && npm test -- --runInBand
```

- [ ] **Step 4: Commit**

```bash
git add src/auth/auth.service.ts src/security/security.module.ts 2>/dev/null
git commit -m "fix(auth): hash emails and user ids in logs to avoid PII leakage"
```

---

### Task 13: `urlencoded extended=false` y límite estricto (L3)

**Files:**
- Modify: `presupuestados-back/src/main.ts`

- [ ] **Step 1: Editar `main.ts`**

Editar `presupuestados-back/src/main.ts`, reemplazar línea 33:

```ts
  app.use(urlencoded({ extended: true, limit: bodyLimit }));
```

Por:

```ts
  app.use(urlencoded({ extended: false, limit: '100kb' }));
```

- [ ] **Step 2: Type check**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add src/main.ts
git commit -m "chore(security): disable extended urlencoded parser to reduce qs attack surface"
```

---

### Task 14: Salt de rate-limit obligatorio en prod + sanitizar `.env.example` (L4)

**Files:**
- Modify: `presupuestados-back/src/security/rate-limit.service.ts`
- Modify: `presupuestados-back/.env.example`

- [ ] **Step 1: Hacer salt fatal en prod**

Editar `presupuestados-back/src/security/rate-limit.service.ts`. Reemplazar el constructor (líneas 20-37):

```ts
  constructor(
    private readonly configService: ConfigService,
    private readonly redisService: RedisService,
    private readonly securityEventsService: SecurityEventsService,
  ) {
    const configuredSalt = this.configService.get<string>(
      'RATE_LIMIT_HASH_SALT',
    );
    const isProduction =
      this.configService.get<string>('NODE_ENV') === 'production';

    if (isProduction && !configuredSalt) {
      throw new Error(
        'RATE_LIMIT_HASH_SALT es obligatorio en producción. Configurar antes de iniciar el servicio.',
      );
    }

    this.hashSalt = configuredSalt ?? 'presupuestados-dev-rate-limit-salt';
  }
```

- [ ] **Step 2: Sanitizar `.env.example`**

Editar `presupuestados-back/.env.example`. Reemplazar:

```
RATE_LIMIT_HASH_SALT=JosyyPedro1609.paratener.nuestro.proyecto.seguro
```

Por:

```
RATE_LIMIT_HASH_SALT=change-me-to-a-long-random-string
```

Y reemplazar el `REDIS_URL` actual (que parece tener una password real):

```
REDIS_URL=redis://default:4Vn0H8uePHTiis82NS3SoFwBP42CKVMgo1LrF9LSA4yAXQcEP19ZOUCDTOiuqMih@ce6giv4gw9dlch5c1gqp7tww:6379/0
```

Por:

```
REDIS_URL=redis://default:<password>@<host>:6379/0
```

**Importante:** notificar al usuario que rote en producción los secretos que estaban filtrados en `.env.example`:
1. `RATE_LIMIT_HASH_SALT` (no es crítico pero conviene)
2. La password del Redis (si esa URL era real)
3. `SUPABASE_SERVICE_KEY` y `OPENAI_API_KEY` si tienen valores reales en algún `.env.example` (verificar).

- [ ] **Step 3: Tests existentes**

```bash
npx jest src/security/rate-limit.service.spec.ts
```

Si algún test no setea `NODE_ENV='production'` pero sí instancia `RateLimitService`, no se romperá (el throw es solo si NODE_ENV=production sin salt). Si algún test setea explícitamente `NODE_ENV=production` sin salt, ajustar fixture.

- [ ] **Step 4: Commit**

```bash
git add src/security/rate-limit.service.ts .env.example
git commit -m "fix(security): make rate-limit salt mandatory in production and sanitize .env.example"
```

---

### Task 15: Warning de `TRUST_PROXY` en prod (L5)

**Files:**
- Modify: `presupuestados-back/src/main.ts`

- [ ] **Step 1: Agregar warning**

Editar `presupuestados-back/src/main.ts`. Reemplazar el bloque (líneas 19-25):

```ts
async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bodyParser: false });
  const corsOrigin = process.env['CORS_ORIGIN'] ?? 'http://localhost:5173';
  const bodyLimit = process.env['JSON_BODY_LIMIT'] ?? '1mb';

  const expressApp = app.getHttpAdapter().getInstance() as Express;
  expressApp.set('trust proxy', parseTrustProxy());
```

Por:

```ts
async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bodyParser: false });
  const corsOrigin = process.env['CORS_ORIGIN'] ?? 'http://localhost:5173';
  const bodyLimit = process.env['JSON_BODY_LIMIT'] ?? '1mb';

  const trustProxy = parseTrustProxy();
  if (process.env['NODE_ENV'] === 'production' && trustProxy === false) {
    console.warn(
      '[BOOT] WARNING: NODE_ENV=production y TRUST_PROXY no configurado. Si el backend está detrás de un proxy/CDN, el rate-limit por IP NO funciona correctamente. Configurar TRUST_PROXY=1 (o el número de hops correcto).',
    );
  }

  const expressApp = app.getHttpAdapter().getInstance() as Express;
  expressApp.set('trust proxy', trustProxy);
```

- [ ] **Step 2: Type check**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add src/main.ts
git commit -m "chore(security): warn on missing TRUST_PROXY in production"
```

---

### Task 16: Hardcodear path de recovery redirect (L6)

**Files:**
- Modify: `presupuestados-back/src/auth/auth.service.ts`

**Contexto:** Hoy `forgotPassword` acepta `redirect_to` y solo valida que el origin coincida. Eso permite redirigir a paths internos arbitrarios. Solución: ignorar el path del body y usar siempre `/update-password`.

- [ ] **Step 1: Editar `resolvePasswordResetRedirect`**

Editar `presupuestados-back/src/auth/auth.service.ts`. Reemplazar el método `resolvePasswordResetRedirect` (líneas ~637-651):

```ts
  private resolvePasswordResetRedirect(_redirectTo?: string): string {
    const allowedBase = this.getAllowedFrontendBaseUrl();
    return new URL('/update-password', allowedBase).toString();
  }
```

(El parámetro queda como `_redirectTo` para preservar la firma sin que el linter se queje del unused param. Si la firma no se usa en tests, también se puede borrar el parámetro y ajustar el caller en `forgotPassword`.)

Verificar callers:
```bash
grep -n "resolvePasswordResetRedirect\|redirect_to" /Users/pedrorozas/personal/presupuestados/presupuestados-back/src/auth/auth.service.ts
```

En `forgotPassword` (línea ~624), el llamado `this.resolvePasswordResetRedirect(dto.redirect_to)` sigue funcionando aunque el argumento se ignore.

- [ ] **Step 2: Eliminar `parseRedirectUrl` si queda huérfano**

Si `parseRedirectUrl` (líneas ~672-678) ya no se usa en otro lado, eliminarlo:

```bash
grep -n "parseRedirectUrl" /Users/pedrorozas/personal/presupuestados/presupuestados-back/src/auth/auth.service.ts
```

Si solo aparece en su declaración, borrarlo.

- [ ] **Step 3: Type check + tests**

```bash
npx tsc --noEmit && npm test -- --runInBand
```

- [ ] **Step 4: Smoke test manual**

```bash
npm run start:dev
```

```bash
curl -i -X POST http://localhost:3000/auth/forgot-password \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","redirect_to":"https://localhost:5173/evil-path"}'
```

Expected: HTTP 200 (no falla por el redirect_to; el server lo ignora). Verificar en logs / Supabase Dashboard que el email enviado apunta a `/update-password`.

- [ ] **Step 5: Commit**

```bash
git add src/auth/auth.service.ts
git commit -m "fix(auth): hardcode recovery redirect path to /update-password"
```

---

## Fase 4 — Verificación Final

### Task 17: Verificar todo en conjunto

**Files:** ninguno (testing).

- [ ] **Step 1: Suite completa de tests backend**

```bash
cd /Users/pedrorozas/personal/presupuestados/presupuestados-back && npm test -- --runInBand
```

Expected: todo pasa.

- [ ] **Step 2: Suite completa de type check + lint frontend**

```bash
cd /Users/pedrorozas/personal/presupuestados/presupuestados-web && npx tsc --noEmit
```

Expected: PASS.

- [ ] **Step 3: Boot backend en modo producción simulado**

```bash
cd /Users/pedrorozas/personal/presupuestados/presupuestados-back
NODE_ENV=production TRUST_PROXY=1 RATE_LIMIT_HASH_SALT=test-salt-real-32-chars-xxxxx npm run build
node dist/main.js
```

Expected: arranca sin errores, no se queja de salt faltante ni TRUST_PROXY. Detener (Ctrl+C).

- [ ] **Step 4: Boot backend producción simulado sin salt**

```bash
NODE_ENV=production npm run start:prod
```

Expected: muere con `Error: RATE_LIMIT_HASH_SALT es obligatorio en producción`. Confirma Task 14.

- [ ] **Step 5: Listar commits hechos en esta rama**

```bash
cd /Users/pedrorozas/personal/presupuestados/presupuestados-back
git log --oneline main..security/hardening-2026-05-21
cd /Users/pedrorozas/personal/presupuestados/presupuestados-web
git log --oneline main..security/hardening-2026-05-21
```

Verificar que cada hallazgo tiene su commit. Debe haber ~14-16 commits en backend y ~2 en frontend.

- [ ] **Step 6: Notificar al usuario los secretos a rotar**

Generar mensaje al usuario:

```
Tareas manuales pendientes después del deploy:

1. Agregar SUPABASE_ANON_KEY al .env de producción (Dashboard Supabase → Settings → API → anon public).
2. Rotar SUPABASE_SERVICE_KEY (Supabase Dashboard → Settings → API → Reset service_role key). El proyecto antes la usaba en flujos públicos, así que pudo quedar en logs.
3. Rotar OPENAI_API_KEY si los logs anteriores la capturaron.
4. Rotar la password de REDIS_URL si la que estaba en .env.example era real (estaba commiteada).
5. Si despliegan tras Cloudflare/Nginx/Load Balancer, setear TRUST_PROXY=1 (o el número de proxies en el chain) en el .env de producción.
6. Definir RATE_LIMIT_HASH_SALT con un valor random largo (al menos 32 chars) en el .env de producción. Ahora es fatal si falta.
7. Actualizar la política de password en Supabase Dashboard → Settings → Auth → Password (mínimo 12 chars).
8. Verificar en preview de Vercel que no hay errores CSP en consola del browser.
```

---

## Resumen de cobertura

| Hallazgo | Severidad | Task(s) |
|---|---|---|
| H1 — Account takeover via update-password | High | 2, 3, 4 |
| H2 — Service role en flujos públicos | High | 1 |
| M1 — Endpoints sin rate-limit | Medium | 10 (y 2 para update-password) |
| M2 — Oráculo de enumeración en register | Medium | 5 |
| M3 — Password mínimo 6 chars | Medium | 2 (update), 3 (reset), 6 (register) |
| M4 — Email no normalizado en partner-requests | Medium | 7 |
| M5 — avatar_url permite javascript: | Medium | 8 |
| M6 — CSP no configurado en Vercel | Medium | 9 |
| L1 — Logout incorrecto | Low | 11 |
| L2 — Emails en logs | Low | 12 |
| L3 — urlencoded extended=true | Low | 13 |
| L4 — Salt fallback + .env.example filtra | Low | 14 |
| L5 — TRUST_PROXY default false | Low | 15 |
| L6 — Open redirect path en recovery | Low | 16 |

Todos los hallazgos del pentest están cubiertos por al menos una tarea.
