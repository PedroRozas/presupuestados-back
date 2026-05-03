import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';
import { SupabaseService } from '../../supabase/supabase.service.js';

export interface AuthenticatedUser {
  id: string;
  email: string;
  user_metadata?: {
    name?: string;
    full_name?: string;
  };
}

/**
 * Guard JWT que valida el token contra Supabase Auth.
 * Si el token es válido, inyecta req.user con { id, email }.
 * La validación del usuario ocurre aquí en el Guard, no en el SupabaseService.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly supabaseService: SupabaseService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const token = this.extractTokenFromRequest(request);

    if (!token) {
      throw new UnauthorizedException(
        'Token de autenticación no proporcionado',
      );
    }

    const { data, error } = await this.supabaseService
      .getClient()
      .auth.getUser(token);

    if (error || !data.user) {
      throw new UnauthorizedException('Token inválido o expirado');
    }

    const metadata = data.user.user_metadata as
      | Record<string, unknown>
      | null
      | undefined;
    const name = metadata?.['name'];
    const fullName = metadata?.['full_name'];

    (request as Request & { user: AuthenticatedUser }).user = {
      id: data.user.id,
      email: data.user.email ?? '',
      user_metadata: {
        ...(typeof name === 'string' ? { name } : {}),
        ...(typeof fullName === 'string' ? { full_name: fullName } : {}),
      },
    };

    return true;
  }

  private extractTokenFromRequest(request: Request): string | undefined {
    const authHeader = request.headers['authorization'];
    const headerToken = this.extractBearerToken(authHeader);
    if (headerToken) return headerToken;

    const cookieToken = (
      request as Request & { cookies?: Record<string, string> }
    ).cookies?.['access_token'] as unknown;
    return typeof cookieToken === 'string' ? cookieToken : undefined;
  }

  private extractBearerToken(
    authHeader: string | undefined,
  ): string | undefined {
    if (!authHeader) return undefined;
    const [type, token] = authHeader.split(' ');
    return type === 'Bearer' ? token : undefined;
  }
}
