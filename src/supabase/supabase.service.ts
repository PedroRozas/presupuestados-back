import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { Database } from './database.types.js';

@Injectable()
export class SupabaseService {
  private readonly client: SupabaseClient<Database>;
  private readonly supabaseUrl: string;
  private readonly supabaseServiceKey: string;

  constructor(private readonly configService: ConfigService) {
    this.supabaseUrl = this.configService.getOrThrow<string>('SUPABASE_URL');
    this.supabaseServiceKey = this.configService.getOrThrow<string>(
      'SUPABASE_SERVICE_KEY',
    );

    this.client = createClient(this.supabaseUrl, this.supabaseServiceKey, {
      auth: {
        // Con la Service Role Key el cliente opera con permisos totales
        // (bypass de RLS). La validación del usuario se realizará en
        // Guards de NestJS, no aquí.
        persistSession: false,
        autoRefreshToken: false,
      },
    });
  }

  /**
   * Devuelve el cliente de Supabase para ser usado en otros servicios.
   * Solo usar métodos del query builder (.select, .insert, .update, .delete).
   * Queda estrictamente prohibido el uso de supabase.rpc().
   */

  getClient(): SupabaseClient<Database> {
    return this.client;
  }

  /**
   * Devuelve un cliente aislado para operaciones de sesión de Supabase Auth.
   * Métodos como signInWithPassword y refreshSession mutan la sesión interna
   * del cliente, por eso no deben ejecutarse sobre el cliente service-role
   * singleton que usan los servicios de datos.
   */
  createAuthClient(): SupabaseClient<Database> {
    return createClient(this.supabaseUrl, this.supabaseServiceKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });
  }
}
