import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { Database } from './database.types.js';

@Injectable()
export class SupabaseService {
  private readonly client: SupabaseClient<Database>;

  constructor(private readonly configService: ConfigService) {
    const supabaseUrl = this.configService.getOrThrow<string>('SUPABASE_URL');
    const supabaseServiceKey = this.configService.getOrThrow<string>(
      'SUPABASE_SERVICE_KEY',
    );

    this.client = createClient(supabaseUrl, supabaseServiceKey, {
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
}
