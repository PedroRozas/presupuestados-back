import {
  BadRequestException,
  ConflictException,
  HttpException,
  Injectable,
  InternalServerErrorException,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import type { User } from '@supabase/supabase-js';
import { randomInt } from 'crypto';
import { SupabaseService } from '../supabase/supabase.service.js';
import { CouplesService } from '../couples/couples.service.js';
import { InitializeUserDto } from './dto/initialize-user.dto.js';
import { LoginDto } from './dto/login.dto.js';
import { RegisterDto } from './dto/register.dto.js';
import { RefreshDto } from './dto/refresh.dto.js';
import { ForgotPasswordDto } from './dto/forgot-password.dto.js';
import { UpdatePasswordDto } from './dto/update-password.dto.js';
import { ResendConfirmationDto } from './dto/resend-confirmation.dto.js';
import { SecurityEventsService } from '../security/security-events.service.js';

export interface AuthSession {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: string;
  user: {
    id: string;
    email: string;
    user_metadata?: {
      name?: string;
      full_name?: string;
    };
  };
}

export interface RegisterResponse {
  message: string;
  emailConfirmationRequired: true;
  user: {
    id: string;
    email: string;
  };
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly couplesService: CouplesService,
    private readonly securityEventsService: SecurityEventsService,
  ) {}

  // ─────────────────────────────────────────────────────────────────────────
  // POST /auth/register
  // Crea un nuevo usuario en Supabase Auth.
  // ─────────────────────────────────────────────────────────────────────────
  async register(dto: RegisterDto): Promise<RegisterResponse> {
    const email = this.normalizeEmail(dto.email);
    const fullName = dto.full_name.trim();
    const inviteCode = this.normalizeInviteCode(dto.invite_code);

    this.logger.log(`Registrando nuevo usuario: ${email}`);
    const authClient = this.supabaseService.createAuthClient();
    const existingUser = await this.findAuthUserByEmail(email);

    if (existingUser) {
      this.throwEmailAlreadyRegistered(existingUser);
    }

    await this.assertInviteCodeCanBeUsedForRegistration(inviteCode);

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

    if (error || !data.user) {
      this.logger.error(`Error en registro: ${error?.message}`);
      if (this.isAlreadyRegisteredError(error?.message)) {
        throw new ConflictException({
          code: 'EMAIL_ALREADY_REGISTERED',
          message:
            'Ese correo ya tiene una cuenta. Inicia sesión o recupera tu contraseña.',
        });
      }
      throw new InternalServerErrorException(
        error?.message ?? 'Error al registrar el usuario',
      );
    }

    if (data.user.identities?.length === 0) {
      throw new ConflictException({
        code: 'EMAIL_ALREADY_REGISTERED',
        message:
          'Ese correo ya tiene una cuenta. Inicia sesión o recupera tu contraseña.',
      });
    }

    this.logger.log(
      `Usuario registrado, pendiente de confirmación: ${data.user.id}`,
    );
    return {
      message:
        'Revisa tu correo para confirmar tu cuenta antes de iniciar sesión.',
      emailConfirmationRequired: true,
      user: {
        id: data.user.id,
        email: data.user.email ?? email,
      },
    };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // POST /auth/login
  // Autentica un usuario existente contra Supabase Auth.
  // Devuelve access_token y refresh_token.
  // ─────────────────────────────────────────────────────────────────────────
  async login(dto: LoginDto): Promise<AuthSession> {
    const email = this.normalizeEmail(dto.email);

    this.logger.log(`Intento de login para: ${email}`);
    const supabase = this.supabaseService.createAuthClient();

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password: dto.password,
    });

    if (error || !data.session || !data.user) {
      this.logger.warn(`Login fallido para ${email}: ${error?.message}`);
      this.securityEventsService.logLoginFailed(email, error?.message);
      if (error?.message.toLowerCase().includes('email not confirmed')) {
        throw new UnauthorizedException(
          'Debes confirmar tu correo antes de iniciar sesión.',
        );
      }

      throw new UnauthorizedException(
        'Credenciales inválidas. Verifica tu email y contraseña.',
      );
    }

    if (!data.user.email_confirmed_at) {
      this.logger.warn(`Login bloqueado para ${email}: email no confirmado`);
      this.securityEventsService.logLoginFailed(email, 'email no confirmado');
      throw new UnauthorizedException(
        'Debes confirmar tu correo antes de iniciar sesión.',
      );
    }

    await this.initializeUserDataFromMetadata(data.user.id, {
      email: data.user.email ?? email,
      fullName: data.user.user_metadata?.['full_name'],
      inviteCode: data.user.user_metadata?.['invite_code'],
    });

    this.logger.log(`Login exitoso: ${data.user.id}`);
    return {
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
      expires_in: data.session.expires_in,
      token_type: data.session.token_type,
      user: {
        id: data.user.id,
        email: data.user.email ?? email,
      },
    };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // POST /auth/refresh
  // Refresca la sesión usando un refresh_token vigente.
  // ─────────────────────────────────────────────────────────────────────────
  async refresh(dto: RefreshDto): Promise<AuthSession> {
    this.logger.log('Refrescando sesión...');
    const supabase = this.supabaseService.createAuthClient();

    const { data, error } = await supabase.auth.refreshSession({
      refresh_token: dto.refresh_token,
    });

    if (error || !data.session || !data.user) {
      this.logger.warn(`Refresh fallido: ${error?.message}`);
      throw new UnauthorizedException(
        'No se pudo renovar la sesión. El refresh_token puede haber expirado.',
      );
    }

    this.logger.log(`Sesión renovada para: ${data.user.id}`);
    return {
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
      expires_in: data.session.expires_in,
      token_type: data.session.token_type,
      user: {
        id: data.user.id,
        email: data.user.email ?? '',
        user_metadata: {
          ...(typeof data.user.user_metadata?.['name'] === 'string'
            ? { name: data.user.user_metadata['name'] }
            : {}),
          ...(typeof data.user.user_metadata?.['full_name'] === 'string'
            ? { full_name: data.user.user_metadata['full_name'] }
            : {}),
        },
      },
    };
  }

  private async initializeUserDataFromMetadata(
    userId: string,
    metadata: {
      email: string;
      fullName?: unknown;
      inviteCode?: unknown;
    },
  ): Promise<void> {
    if (typeof metadata.fullName !== 'string' || !metadata.fullName.trim()) {
      return;
    }

    const normalizedInviteCode =
      typeof metadata.inviteCode === 'string' && metadata.inviteCode.trim()
        ? metadata.inviteCode.trim().toUpperCase()
        : undefined;

    const initializationDto = {
      p_email: this.normalizeEmail(metadata.email),
      p_full_name: metadata.fullName.trim(),
      p_invite_code: normalizedInviteCode,
    };

    try {
      await this.initializeUserData(userId, initializationDto);
    } catch (error) {
      if (!normalizedInviteCode || !this.isInviteCodeInvalidError(error)) {
        throw error;
      }

      this.logger.warn(
        `Invite_code guardado inválido para ${userId}: ${normalizedInviteCode}. Inicializando pareja nueva.`,
      );
      await this.initializeUserData(userId, {
        ...initializationDto,
        p_invite_code: undefined,
      });
    }
  }

  private normalizeEmail(email: string): string {
    return email.trim().toLowerCase();
  }

  private normalizeInviteCode(inviteCode?: string | null): string | null {
    const normalized = inviteCode?.trim().toUpperCase();
    return normalized || null;
  }

  private async assertInviteCodeCanBeUsedForRegistration(
    inviteCode: string | null,
  ): Promise<void> {
    if (!inviteCode) return;

    const supabase = this.supabaseService.getClient();
    const { data: couple, error: coupleError } = await supabase
      .from('couples')
      .select('id')
      .eq('invite_code', inviteCode)
      .maybeSingle();

    if (coupleError) {
      this.logger.error(
        `Error validando invite_code ${inviteCode}: ${coupleError.message}`,
      );
      throw new InternalServerErrorException(
        `Error al validar código de invitación: ${coupleError.message}`,
      );
    }

    if (!couple) {
      throw new BadRequestException({
        code: 'INVITE_CODE_INVALID',
        message: `El código de invitación '${inviteCode}' no es válido`,
      });
    }

    const { data: familyMembers, error: membersError } = await supabase
      .from('family_members')
      .select('id, linked_user_id')
      .eq('couple_id', couple.id);

    if (membersError) {
      this.logger.error(
        `Error validando cupos para invite_code ${inviteCode}: ${membersError.message}`,
      );
      throw new InternalServerErrorException(
        `Error al validar cupos de pareja: ${membersError.message}`,
      );
    }

    const linkedMembersCount =
      familyMembers?.filter((member) => member.linked_user_id).length ?? 0;
    const hasEmptySlot =
      familyMembers?.some((member) => !member.linked_user_id) ?? false;

    if (linkedMembersCount >= 2 || !hasEmptySlot) {
      throw new ConflictException({
        code: 'COUPLE_ALREADY_FULL',
        message:
          'Este código ya fue usado por otra cuenta. Pide a tu pareja revisar su vínculo.',
      });
    }
  }

  private isInviteCodeInvalidError(error: unknown): boolean {
    if (!(error instanceof HttpException)) return false;

    const response = error.getResponse();
    return (
      typeof response === 'object' &&
      response !== null &&
      'code' in response &&
      response.code === 'INVITE_CODE_INVALID'
    );
  }

  private isAlreadyRegisteredError(message?: string): boolean {
    const normalized = message?.toLowerCase() ?? '';
    return normalized.includes('already') || normalized.includes('registered');
  }

  private async findAuthUserByEmail(email: string): Promise<User | null> {
    const supabase = this.supabaseService.createAuthClient();
    const perPage = 1000;

    for (let page = 1; page <= 5; page += 1) {
      const { data, error } = await supabase.auth.admin.listUsers({
        page,
        perPage,
      });

      if (error) {
        this.logger.warn(
          `No se pudo verificar existencia del correo en Auth: ${error.message}`,
        );
        return this.findProfileAuthFallback(email);
      }

      const found = data.users.find(
        (user) => user.email?.toLowerCase() === email,
      );
      if (found) return found;
      if (data.users.length < perPage) return null;
    }

    return this.findProfileAuthFallback(email);
  }

  private async findProfileAuthFallback(email: string): Promise<User | null> {
    const supabase = this.supabaseService.getClient();
    const { data, error } = await supabase
      .from('profiles')
      .select('id,email')
      .ilike('email', email)
      .limit(1)
      .maybeSingle();

    if (error || !data) return null;

    return {
      id: data.id,
      email: data.email ?? email,
      app_metadata: {},
      user_metadata: {},
      aud: 'authenticated',
      confirmed_at: new Date(0).toISOString(),
      email_confirmed_at: new Date(0).toISOString(),
      created_at: new Date(0).toISOString(),
    };
  }

  private throwEmailAlreadyRegistered(user: User): never {
    if (!user.email_confirmed_at && !user.confirmed_at) {
      throw new ConflictException({
        code: 'EMAIL_PENDING_CONFIRMATION',
        message:
          'Ese correo ya tiene una cuenta pendiente de confirmación. Puedes reenviar el correo de confirmación.',
      });
    }

    throw new ConflictException({
      code: 'EMAIL_ALREADY_REGISTERED',
      message:
        'Ese correo ya tiene una cuenta. Inicia sesión o recupera tu contraseña.',
    });
  }

  private generateInviteCode(): string {
    const alphabet = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    let code = '';

    for (let index = 0; index < 6; index += 1) {
      code += alphabet[randomInt(alphabet.length)];
    }

    return code;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // POST /auth/logout
  // Invalida el token activo en Supabase Auth.
  // ─────────────────────────────────────────────────────────────────────────
  async logout(accessToken: string): Promise<{ message: string }> {
    this.logger.log('Cerrando sesión...');
    const supabase = this.supabaseService.getClient();

    // Necesitamos setear el token del usuario para invalidar SOLO su sesión
    const { error } = await supabase.auth.admin.signOut(accessToken);

    if (error) {
      this.logger.error(`Error en logout: ${error.message}`);
      throw new InternalServerErrorException(
        `Error al cerrar sesión: ${error.message}`,
      );
    }

    this.logger.log('Sesión cerrada exitosamente');
    return { message: 'Sesión cerrada correctamente' };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // POST /auth/initialize
  // Inicializa los datos complementarios del usuario recién registrado.
  // Reemplaza el RPC `initialize_user_data`.
  // ─────────────────────────────────────────────────────────────────────────
  async initializeUserData(
    userId: string,
    dto: InitializeUserDto,
  ): Promise<{ message: string; coupleId?: string }> {
    const supabase = this.supabaseService.getClient();
    const email = this.normalizeEmail(dto.p_email);
    const fullName = dto.p_full_name.trim();
    const inviteCode = this.normalizeInviteCode(dto.p_invite_code);

    this.logger.log(`Inicializando datos para usuario: ${userId}`);

    // Guarda de idempotencia: si ya tiene pareja, no reinicializar
    const { data: existingProfile } = await supabase
      .from('profiles')
      .select('couple_id')
      .eq('id', userId)
      .single();

    if (existingProfile?.couple_id) {
      this.logger.log(
        `Usuario ${userId} ya inicializado. coupleId: ${existingProfile.couple_id}`,
      );
      return {
        message: 'Usuario ya inicializado',
        coupleId: existingProfile.couple_id,
      };
    }

    // Paso 2.1 — Crear/actualizar la tabla profiles con email y full_name.
    // En algunos entornos la fila no se crea por trigger al registrar auth.users.
    const { error: profileError } = await supabase.from('profiles').upsert({
      id: userId,
      email,
      full_name: fullName,
    });

    if (profileError) {
      this.logger.error(
        `Error actualizando perfil para ${userId}: ${profileError.message}`,
      );
      throw new InternalServerErrorException(
        `Error al actualizar perfil: ${profileError.message}`,
      );
    }

    // Paso 2.2 — Delegar vinculación si viene invite_code
    if (inviteCode) {
      this.logger.log(
        `Usuario ${userId} provee invite_code. Vinculando a pareja existente...`,
      );
      await this.couplesService.joinCouple(userId, inviteCode);

      const { data: updatedProfile } = await supabase
        .from('profiles')
        .select('couple_id')
        .eq('id', userId)
        .single();

      return {
        message: 'Usuario inicializado y vinculado a pareja existente',
        coupleId: updatedProfile?.couple_id ?? undefined,
      };
    }

    // Paso 2.3 — Si no viene invite_code: crear nueva pareja
    this.logger.log(
      `Usuario ${userId} sin invite_code. Generando nueva pareja...`,
    );

    let newCoupleId = '';
    let newInviteCode = this.generateInviteCode();
    let success = false;
    let retries = 10;

    while (retries > 0 && !success) {
      const { data: insertedCouple, error: coupleError } = await supabase
        .from('couples')
        .insert({ invite_code: newInviteCode })
        .select('id')
        .single();

      if (coupleError) {
        if (coupleError.code === '23505') {
          // Unique constraint violation — reintentar con otro código
          this.logger.warn(
            `Colisión de invite_code: ${newInviteCode}. Reintentando...`,
          );
          newInviteCode = this.generateInviteCode();
          retries--;
          continue;
        }
        this.logger.error(`Error creando nueva pareja: ${coupleError.message}`);
        throw new InternalServerErrorException(
          `Error al crear pareja: ${coupleError.message}`,
        );
      }

      newCoupleId = insertedCouple.id;
      success = true;
    }

    if (!success) {
      throw new InternalServerErrorException(
        'No se pudo generar un código de invitación único tras varios intentos',
      );
    }

    // Asignar el couple_id al perfil del usuario
    const { error: assignCoupleError } = await supabase
      .from('profiles')
      .update({ couple_id: newCoupleId })
      .eq('id', userId);

    if (assignCoupleError) {
      this.logger.error(
        `Error asignando pareja al perfil: ${assignCoupleError.message}`,
      );
      throw new InternalServerErrorException(
        `Error al asignar pareja: ${assignCoupleError.message}`,
      );
    }

    // Insertar miembro 1: El usuario actual (REGLA: paid_by/assigned_user_id usan este UUID)
    const { error: member1Error } = await supabase
      .from('family_members')
      .insert({
        couple_id: newCoupleId,
        owner_id: userId,
        linked_user_id: userId,
        name: fullName,
      });

    if (member1Error) {
      this.logger.error(
        `Error creando miembro 1 de la familia: ${member1Error.message}`,
      );
      throw new InternalServerErrorException(
        `Error al crear miembros familiares: ${member1Error.message}`,
      );
    }

    // Insertar miembro 2: Slot vacío para la futura pareja
    const { error: member2Error } = await supabase
      .from('family_members')
      .insert({
        couple_id: newCoupleId,
        owner_id: userId,
        linked_user_id: null,
        name: 'Pareja',
      });

    if (member2Error) {
      this.logger.error(
        `Error creando slot familiar vacío: ${member2Error.message}`,
      );
      throw new InternalServerErrorException(
        `Error al crear slot familiar: ${member2Error.message}`,
      );
    }

    this.logger.log(`Nueva pareja creada exitosamente: ${newCoupleId}`);
    return {
      message: 'Usuario inicializado y pareja creada',
      coupleId: newCoupleId,
    };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // POST /auth/forgot-password
  // Envía el email de recuperación de contraseña via Supabase Auth.
  // Siempre responde con éxito para no revelar si el email existe.
  // ─────────────────────────────────────────────────────────────────────────
  async forgotPassword(dto: ForgotPasswordDto): Promise<{ message: string }> {
    const email = this.normalizeEmail(dto.email);

    this.logger.log(`Solicitud de recuperación para: ${email}`);
    const supabase = this.supabaseService.createAuthClient();

    const redirectTo = this.resolvePasswordResetRedirect(dto.redirect_to);

    await supabase.auth.resetPasswordForEmail(email, {
      redirectTo,
    });

    // No se propaga el error para no revelar si el email está registrado
    return {
      message:
        'Si el correo existe, recibirás instrucciones para recuperar tu contraseña.',
    };
  }

  private resolvePasswordResetRedirect(redirectTo?: string): string {
    const allowedBase = this.getAllowedFrontendBaseUrl();
    const allowed = new URL(allowedBase);
    const requested = redirectTo
      ? this.parseRedirectUrl(redirectTo)
      : new URL('/update-password', allowed);

    if (requested.origin !== allowed.origin) {
      throw new BadRequestException(
        'redirect_to no está en el dominio permitido',
      );
    }

    return requested.toString();
  }

  private getAllowedFrontendBaseUrl(): string {
    const allowedBase =
      process.env['FRONTEND_URL'] ?? process.env['CORS_ORIGIN'];

    if (!allowedBase) {
      throw new BadRequestException(
        'Configuración de redirect_to no disponible',
      );
    }

    try {
      return new URL(allowedBase).origin;
    } catch {
      throw new BadRequestException(
        'Configuración de redirect_to no es una URL válida',
      );
    }
  }

  private parseRedirectUrl(redirectTo: string): URL {
    try {
      return new URL(redirectTo);
    } catch {
      throw new BadRequestException('redirect_to no es una URL válida');
    }
  }

  async resendConfirmation(
    dto: ResendConfirmationDto,
  ): Promise<{ message: string }> {
    const email = this.normalizeEmail(dto.email);
    const supabase = this.supabaseService.createAuthClient();
    const { error } = await supabase.auth.resend({
      type: 'signup',
      email,
    });

    if (error) {
      this.logger.warn(
        `No se pudo reenviar confirmación a ${email}: ${error.message}`,
      );
    }

    return {
      message:
        'Si el correo tiene una confirmación pendiente, recibirás un nuevo mensaje.',
    };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // PUT /auth/update-password
  // Actualiza la contraseña del usuario autenticado.
  // Requiere el access_token de recuperación (extraído del hash de la URL
  // de redirección del email) como Bearer token.
  // ─────────────────────────────────────────────────────────────────────────
  async updatePassword(
    userId: string,
    dto: UpdatePasswordDto,
  ): Promise<{ message: string }> {
    this.logger.log(`Actualizando contraseña para usuario: ${userId}`);
    const supabase = this.supabaseService.getClient();

    const { error } = await supabase.auth.admin.updateUserById(userId, {
      password: dto.new_password,
    });

    if (error) {
      this.logger.error(`Error actualizando contraseña: ${error.message}`);
      throw new UnauthorizedException('No se pudo actualizar la contraseña');
    }

    this.logger.log(`Contraseña actualizada para usuario: ${userId}`);
    return { message: 'Contraseña actualizada correctamente' };
  }
}
