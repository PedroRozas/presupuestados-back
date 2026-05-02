import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service.js';
import { CouplesService } from '../couples/couples.service.js';
import { InitializeUserDto } from './dto/initialize-user.dto.js';
import { LoginDto } from './dto/login.dto.js';
import { RegisterDto } from './dto/register.dto.js';
import { RefreshDto } from './dto/refresh.dto.js';
import { ForgotPasswordDto } from './dto/forgot-password.dto.js';
import { UpdatePasswordDto } from './dto/update-password.dto.js';

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
  ) {}

  // ─────────────────────────────────────────────────────────────────────────
  // POST /auth/register
  // Crea un nuevo usuario en Supabase Auth.
  // ─────────────────────────────────────────────────────────────────────────
  async register(dto: RegisterDto): Promise<RegisterResponse> {
    this.logger.log(`Registrando nuevo usuario: ${dto.email}`);
    const authClient = this.supabaseService.createAuthClient();

    const { data, error } = await authClient.auth.signUp({
      email: dto.email,
      password: dto.password,
      options: {
        data: {
          full_name: dto.full_name,
          invite_code: dto.invite_code?.trim().toUpperCase() || null,
        },
      },
    });

    if (error || !data.user) {
      this.logger.error(`Error en registro: ${error?.message}`);
      throw new InternalServerErrorException(
        error?.message ?? 'Error al registrar el usuario',
      );
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
        email: data.user.email ?? dto.email,
      },
    };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // POST /auth/login
  // Autentica un usuario existente contra Supabase Auth.
  // Devuelve access_token y refresh_token.
  // ─────────────────────────────────────────────────────────────────────────
  async login(dto: LoginDto): Promise<AuthSession> {
    this.logger.log(`Intento de login para: ${dto.email}`);
    const supabase = this.supabaseService.createAuthClient();

    const { data, error } = await supabase.auth.signInWithPassword({
      email: dto.email,
      password: dto.password,
    });

    if (error || !data.session || !data.user) {
      this.logger.warn(`Login fallido para ${dto.email}: ${error?.message}`);
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
        `Login bloqueado para ${dto.email}: email no confirmado`,
      );
      throw new UnauthorizedException(
        'Debes confirmar tu correo antes de iniciar sesión.',
      );
    }

    await this.initializeUserDataFromMetadata(data.user.id, {
      email: data.user.email ?? dto.email,
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
        email: data.user.email ?? dto.email,
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

    await this.initializeUserData(userId, {
      p_email: metadata.email,
      p_full_name: metadata.fullName.trim(),
      p_invite_code:
        typeof metadata.inviteCode === 'string' && metadata.inviteCode.trim()
          ? metadata.inviteCode.trim().toUpperCase()
          : undefined,
    });
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
      email: dto.p_email,
      full_name: dto.p_full_name,
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
    if (dto.p_invite_code) {
      this.logger.log(
        `Usuario ${userId} provee invite_code. Vinculando a pareja existente...`,
      );
      await this.couplesService.joinCouple(userId, dto.p_invite_code);

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

    const generateCode = () =>
      Math.random().toString(36).substring(2, 8).toUpperCase();

    let newCoupleId = '';
    let inviteCode = generateCode();
    let success = false;
    let retries = 3;

    while (retries > 0 && !success) {
      const { data: insertedCouple, error: coupleError } = await supabase
        .from('couples')
        .insert({ invite_code: inviteCode })
        .select('id')
        .single();

      if (coupleError) {
        if (coupleError.code === '23505') {
          // Unique constraint violation — reintentar con otro código
          this.logger.warn(
            `Colisión de invite_code: ${inviteCode}. Reintentando...`,
          );
          inviteCode = generateCode();
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
        name: dto.p_full_name,
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
    this.logger.log(`Solicitud de recuperación para: ${dto.email}`);
    const supabase = this.supabaseService.createAuthClient();

    // Validar redirect_to contra la URL base del frontend configurada
    if (dto.redirect_to) {
      const allowedBase = process.env['FRONTEND_URL'];
      if (!allowedBase) {
        throw new BadRequestException(
          'Configuración de redirect_to no disponible',
        );
      }
      const allowed = new URL(allowedBase);
      let requested: URL;
      try {
        requested = new URL(dto.redirect_to);
      } catch {
        throw new BadRequestException('redirect_to no es una URL válida');
      }
      if (requested.origin !== allowed.origin) {
        throw new BadRequestException(
          'redirect_to no está en el dominio permitido',
        );
      }
    }

    await supabase.auth.resetPasswordForEmail(dto.email, {
      redirectTo: dto.redirect_to,
    });

    // No se propaga el error para no revelar si el email está registrado
    return {
      message: 'Si el email existe, recibirás un enlace de recuperación',
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
