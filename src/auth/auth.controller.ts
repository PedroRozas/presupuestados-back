import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { AuthGuard, AuthenticatedUser } from '../common/guards/auth.guard.js';
import { AuthService } from './auth.service.js';
import { InitializeUserDto } from './dto/initialize-user.dto.js';
import { LoginDto } from './dto/login.dto.js';
import { RefreshDto } from './dto/refresh.dto.js';
import { RegisterDto } from './dto/register.dto.js';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  /**
   * POST /auth/register
   * Crea un nuevo usuario en Supabase Auth.
   * No requiere token previo.
   */
  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  /**
   * POST /auth/login
   * Autentica al usuario y devuelve access_token + refresh_token.
   * El frontend debe almacenar estos tokens y enviarlos en cabeceras posteriores.
   */
  @Post('login')
  @HttpCode(HttpStatus.OK)
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  /**
   * POST /auth/refresh
   * Renueva la sesión usando el refresh_token.
   * Devuelve un nuevo access_token y refresh_token.
   */
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  refresh(@Body() dto: RefreshDto) {
    return this.authService.refresh(dto);
  }

  /**
   * POST /auth/logout
   * Invalida el token del usuario autenticado en Supabase Auth.
   * Requiere el Bearer token activo.
   */
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @UseGuards(AuthGuard)
  logout(@Req() req: Request & { user: AuthenticatedUser }) {
    const token = req.headers['authorization']?.split(' ')[1] ?? '';
    return this.authService.logout(token);
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
}
