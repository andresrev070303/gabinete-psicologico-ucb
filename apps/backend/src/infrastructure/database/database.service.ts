import { Injectable, Logger } from '@nestjs/common';
import type { OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { databaseSchema } from './database.schema.js';
import type { AppDatabase } from './database.types.js';

type ConnectionProbe = { database_name: string; role_name: string };

@Injectable()
export class DatabaseService implements OnModuleDestroy {
  private readonly logger = new Logger(DatabaseService.name);
  private readonly pool: Pool;
  readonly db: AppDatabase;

  constructor(config: ConfigService) {
    this.pool = new Pool({
      connectionString: config.getOrThrow<string>('DATABASE_URL'),
      max: 5,
      connectionTimeoutMillis: 10_000,
      idleTimeoutMillis: 10_000,
      query_timeout: 10_000,
      enableChannelBinding: true,
    });
    this.pool.on('error', () => {
      this.logger.warn('An idle PostgreSQL connection was interrupted.');
    });
    this.db = drizzle(this.pool, { schema: databaseSchema });
  }

  async checkConnection(): Promise<void> {
    const result = await this.db.execute<ConnectionProbe>(sql`
      SELECT current_database() AS database_name, current_user AS role_name
    `);
    const connection = result.rows[0];
    if (connection?.database_name !== 'gabinete_ucb' || connection?.role_name !== 'gabinete_app') {
      throw new Error('The connection does not use the expected database and runtime role.');
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.pool.end();
  }
}
