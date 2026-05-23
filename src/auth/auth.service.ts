import {
  BadRequestException,
  ConflictException,
  HttpException,
  Injectable,
  InternalServerErrorException,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { randomInt } from 'crypto';
import { SupabaseService } from '../supabase/supabase.service.js';
import { CouplesService } from '../couples/couples.service.js';
import { InitializeUserDto } from './dto/initialize-user.dto.js';
import { LoginDto } from './dto/login.dto.js';
import { RegisterDto } from './dto/register.dto.js';
import { RefreshDto } from './dto/refresh.dto.js';
import { ForgotPasswordDto } from './dto/forgot-password.dto.js';
import { UpdatePasswordDto } from './dto/update-password.dto.js';
import { ResetPasswordDto } from './dto/reset-password.dto.js';
import { ResendConfirmationDto } from './dto/resend-confirmation.dto.js';
import { SecurityEventsService } from '../security/security-events.service.js';
import { RateLimitService } from '../security/rate-limit.service.js';

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
    private readonly rateLimitService: RateLimitService,
  ) {}

  async register(dto: RegisterDto): Promise<RegisterResponse> {
    const email = this.normalizeEmail(dto.email);
    const fullName = dto.full_name.trim();
    const inviteCode = this.normalizeInviteCode(dto.invite_code);

    this.logger.log(
      `Solicitud de registro recibida (hash=${this.rateLimitService.hashIdentifier(email)})`,
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
      const { error: resendError } = await resendClient.auth.resend({
        type: 'signup',
        email,
      });
      if (resendError) {
        this.logger.warn(
          `Resend silencioso falló: ${resendError.message}`,
        );
      }
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

  // ─────────────────────────────────────────────────────────────────────────
  // POST /auth/login
  // Autentica un usuario existente contra Supabase Auth.
  // Devuelve access_token y refresh_token.
  // ─────────────────────────────────────────────────────────────────────────
  async login(dto: LoginDto): Promise<AuthSession> {
    const email = this.normalizeEmail(dto.email);

    this.logger.log(
      `Intento de login (email_hash=${this.rateLimitService.hashIdentifier(email)})`,
    );
    const supabase = this.supabaseService.createPublicAuthClient();

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password: dto.password,
    });

    if (error || !data.session || !data.user) {
      this.logger.warn(
        `Login fallido (email_hash=${this.rateLimitService.hashIdentifier(email)}): ${error?.message}`,
      );
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
      this.logger.warn(
        `Login bloqueado (email_hash=${this.rateLimitService.hashIdentifier(email)}): email no confirmado`,
      );
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
    const supabase = this.supabaseService.createPublicAuthClient();

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

    this.logger.log(
      `Solicitud de recuperación (email_hash=${this.rateLimitService.hashIdentifier(email)})`,
    );
    const supabase = this.supabaseService.createPublicAuthClient();

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
    const supabase = this.supabaseService.createPublicAuthClient();
    const { error } = await supabase.auth.resend({
      type: 'signup',
      email,
    });

    if (error) {
      this.logger.warn(
        `No se pudo reenviar confirmación (email_hash=${this.rateLimitService.hashIdentifier(email)}): ${error.message}`,
      );
    }

    return {
      message:
        'Si el correo tiene una confirmación pendiente, recibirás un nuevo mensaje.',
    };
  }

  async updatePassword(
    userId: string,
    userEmail: string,
    dto: UpdatePasswordDto,
  ): Promise<{ message: string }> {
    this.logger.log(
      `Actualizando contraseña para usuario: ${this.userIdPrefix(userId)}`,
    );

    if (dto.current_password === dto.new_password) {
      throw new BadRequestException(
        'La nueva contraseña debe ser distinta de la actual',
      );
    }

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
      `Contraseña actualizada para usuario: ${this.userIdPrefix(userId)}`,
    );
    return { message: 'Contraseña actualizada correctamente' };
  }

  private userIdPrefix(userId: string): string {
    return userId.slice(0, 8);
  }

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
      this.logger.error(`Error en reset-password: ${updateError.message}`);
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
      `Reset-password completado para usuario ${this.userIdPrefix(userId)}`,
    );
    return { message: 'Contraseña restablecida correctamente' };
  }
}
