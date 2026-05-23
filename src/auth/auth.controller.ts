import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Put,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import type { CookieOptions, Request, Response } from 'express';
import { AuthGuard } from '../common/guards/auth.guard.js';
import type { AuthenticatedUser } from '../common/guards/auth.guard.js';
import { AuthService } from './auth.service.js';
import { InitializeUserDto } from './dto/initialize-user.dto.js';
import { LoginDto } from './dto/login.dto.js';
import { RefreshDto } from './dto/refresh.dto.js';
import { RegisterDto } from './dto/register.dto.js';
import { ForgotPasswordDto } from './dto/forgot-password.dto.js';
import { UpdatePasswordDto } from './dto/update-password.dto.js';
import { ResetPasswordDto } from './dto/reset-password.dto.js';
import { ResendConfirmationDto } from './dto/resend-confirmation.dto.js';
import { RateLimit } from '../security/decorators/rate-limit.decorator.js';

const ACCESS_TOKEN_COOKIE = 'access_token';
const REFRESH_TOKEN_COOKIE = 'refresh_token';
const ACCESS_TOKEN_MAX_AGE_MS = 60 * 60 * 1000;
const REFRESH_TOKEN_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

const COOKIE_OPTIONS: CookieOptions = {
  httpOnly: true,
  secure: process.env['NODE_ENV'] === 'production',
  sameSite: 'strict',
  path: '/',
};

type CookieRequest = Request & { cookies?: Record<string, string> };

const getCookie = (req: Request, name: string): string | undefined => {
  const value = (req as CookieRequest).cookies?.[name] as unknown;
  return typeof value === 'string' ? value : undefined;
};

const getBearerToken = (req: Request): string | undefined => {
  const authHeader = req.headers['authorization'];
  const [type, token] = authHeader?.split(' ') ?? [];
  return type === 'Bearer' ? token : undefined;
};

const setAuthCookies = (
  res: Response,
  session: {
    access_token: string;
    refresh_token: string;
  },
) => {
  res.cookie(ACCESS_TOKEN_COOKIE, session.access_token, {
    ...COOKIE_OPTIONS,
    maxAge: ACCESS_TOKEN_MAX_AGE_MS,
  });
  res.cookie(REFRESH_TOKEN_COOKIE, session.refresh_token, {
    ...COOKIE_OPTIONS,
    maxAge: REFRESH_TOKEN_MAX_AGE_MS,
  });
};

const clearAuthCookies = (res: Response) => {
  res.clearCookie(ACCESS_TOKEN_COOKIE, COOKIE_OPTIONS);
  res.clearCookie(REFRESH_TOKEN_COOKIE, COOKIE_OPTIONS);
};

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  /**
   * POST /auth/register
   * Crea un nuevo usuario en Supabase Auth.
   * No requiere token previo.
   */
  @Post('register')
  @RateLimit('authRegister')
  @HttpCode(HttpStatus.CREATED)
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  /**
   * POST /auth/login
   * Autentica al usuario y deja access_token + refresh_token en cookies HttpOnly.
   */
  @Post('login')
  @RateLimit('authLogin')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const session = await this.authService.login(dto);
    setAuthCookies(res, session);
    return { user: session.user };
  }

  /**
   * POST /auth/refresh
   * Renueva la sesión usando la cookie refresh_token.
   */
  @Post('refresh')
  @RateLimit('authRefresh')
  @HttpCode(HttpStatus.OK)
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Body('refresh_token') refreshTokenFromBody?: string,
  ) {
    const refreshToken =
      getCookie(req, REFRESH_TOKEN_COOKIE) ?? refreshTokenFromBody;
    if (!refreshToken) {
      throw new UnauthorizedException('Refresh token no proporcionado');
    }

    const session = await this.authService.refresh({
      refresh_token: refreshToken,
    } satisfies RefreshDto);
    setAuthCookies(res, session);
    return { user: session.user };
  }

  /**
   * POST /auth/logout
   * Invalida el token del usuario autenticado en Supabase Auth.
   * Requiere cookie o Bearer token activo.
   */
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @UseGuards(AuthGuard)
  logout(
    @Req() req: Request & { user: AuthenticatedUser },
    @Res({ passthrough: true }) res: Response,
  ) {
    const token =
      getBearerToken(req) ?? getCookie(req, ACCESS_TOKEN_COOKIE) ?? '';
    clearAuthCookies(res);
    return this.authService.logout(token);
  }

  /**
   * GET /auth/me
   * Devuelve el usuario autenticado usando la cookie HttpOnly.
   */
  @Get('me')
  @HttpCode(HttpStatus.OK)
  @UseGuards(AuthGuard)
  me(@Req() req: Request & { user: AuthenticatedUser }): AuthenticatedUser {
    return req.user;
  }

  /**
   * POST /auth/initialize
   * Inicializa la cuenta del usuario recién registrado:
   * actualiza el perfil, crea la pareja y asigna los family_members.
   * Requiere Bearer token válido.
   */
  @Post('initialize')
  @HttpCode(HttpStatus.OK)
  @UseGuards(AuthGuard)
  initializeUserData(
    @Body() dto: InitializeUserDto,
    @Req() req: Request & { user: AuthenticatedUser },
  ): Promise<{ message: string; coupleId?: string }> {
    return this.authService.initializeUserData(req.user.id, dto);
  }

  /**
   * POST /auth/forgot-password
   * Envía el email de recuperación de contraseña.
   * Siempre responde con éxito (no revela si el email existe).
   */
  @Post('forgot-password')
  @RateLimit('passwordReset')
  @HttpCode(HttpStatus.OK)
  forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.forgotPassword(dto);
  }

  /**
   * POST /auth/resend-confirmation
   * Reenvía el correo de confirmación si la cuenta sigue pendiente.
   */
  @Post('resend-confirmation')
  @RateLimit('passwordReset')
  @HttpCode(HttpStatus.OK)
  resendConfirmation(@Body() dto: ResendConfirmationDto) {
    return this.authService.resendConfirmation(dto);
  }

  @Put('update-password')
  @RateLimit('passwordUpdate')
  @HttpCode(HttpStatus.OK)
  @UseGuards(AuthGuard)
  async updatePassword(
    @Body() dto: UpdatePasswordDto,
    @Req() req: Request & { user: AuthenticatedUser },
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.updatePassword(
      req.user.id,
      req.user.email,
      dto,
    );
    clearAuthCookies(res);
    return result;
  }

  @Post('reset-password')
  @RateLimit('passwordUpdate')
  @HttpCode(HttpStatus.OK)
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto);
  }
}
