import {
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

export interface AuthSession {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: string;
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
  async register(dto: RegisterDto): Promise<AuthSession> {
    this.logger.log(`Registrando nuevo usuario: ${dto.email}`);
    const supabase = this.supabaseService.getClient();

    const { data, error } = await supabase.auth.signUp({
      email: dto.email,
      password: dto.password,
    });

    if (error || !data.session || !data.user) {
      this.logger.error(`Error en registro: ${error?.message}`);
      throw new InternalServerErrorException(
        error?.message ?? 'Error al registrar el usuario',
      );
    }

    this.logger.log(`Usuario registrado: ${data.user.id}`);
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
  // POST /auth/login
  // Autentica un usuario existente contra Supabase Auth.
  // Devuelve access_token y refresh_token.
  // ─────────────────────────────────────────────────────────────────────────
  async login(dto: LoginDto): Promise<AuthSession> {
    this.logger.log(`Intento de login para: ${dto.email}`);
    const supabase = this.supabaseService.getClient();

    const { data, error } = await supabase.auth.signInWithPassword({
      email: dto.email,
      password: dto.password,
    });

    if (error || !data.session || !data.user) {
      this.logger.warn(`Login fallido para ${dto.email}: ${error?.message}`);
      throw new UnauthorizedException(
        'Credenciales inválidas. Verifica tu email y contraseña.',
      );
    }

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
    const supabase = this.supabaseService.getClient();

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
      },
    };
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

    // Paso 2.1 — Actualizar la tabla profiles con email y full_name
    const { error: profileError } = await supabase
      .from('profiles')
      .update({
        email: dto.p_email,
        full_name: dto.p_full_name,
      })
      .eq('owner_id', userId);

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
        .eq('owner_id', userId)
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
      .eq('owner_id', userId);

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
}
