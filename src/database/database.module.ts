import { Module, Global } from '@nestjs/common'
import { ConfigModule, ConfigService } from '@nestjs/config'
import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import * as schema from './schema/index.js'

export const DRIZZLE = Symbol('DRIZZLE')

@Global()
@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: DRIZZLE,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const connectionString = config.getOrThrow<string>('DATABASE_URL')
        const pool = new Pool({ connectionString })
        return drizzle(pool, { schema })
      },
    },
  ],
  exports: [DRIZZLE],
})
export class DatabaseModule {}
