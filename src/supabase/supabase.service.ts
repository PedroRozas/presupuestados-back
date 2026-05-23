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

    this.client = this.createIsolatedClient(this.supabaseServiceKey);
  }

  getClient(): SupabaseClient<Database> {
    return this.client;
  }

  createAdminAuthClient(): SupabaseClient<Database> {
    return this.createIsolatedClient(this.supabaseServiceKey);
  }

  createPublicAuthClient(): SupabaseClient<Database> {
    return this.createIsolatedClient(this.supabaseAnonKey);
  }

  private createIsolatedClient(key: string): SupabaseClient<Database> {
    return createClient(this.supabaseUrl, key, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });
  }
}
