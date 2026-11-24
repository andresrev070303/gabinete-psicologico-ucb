import { Injectable, Logger } from '@nestjs/common';
import type { OnModuleDestroy } from '@nestjs/common'; 
import { ConfigService } from '@nestjs/config';
import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';

type ConnectionProbe = {
    database_name : string
    role_name : string
} 
@Injectable()
export class DatabaseService implements OnModuleDestroy {
  private readonly logger = new Logger(DatabaseService.name);
  private readonly pool: Pool;
  readonly db: NodePgDatabase;

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
      this.logger.warn('Se interrumpió una conexión inactiva de PostgreSQL.');
    });

    this.db = drizzle(this.pool);
  }

  async checkConnection(): Promise<void> {
    const result = await this.db.execute<ConnectionProbe>(sql`
      SELECT
        current_database() AS database_name,
        current_user AS role_name
    `);

    const connection = result.rows[0];

    if (
      connection?.database_name !== 'gabinete_ucb' ||
      connection?.role_name !== 'gabinete_app'
    ) {
      throw new Error('La conexión no utiliza la base y el rol previstos.');
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.pool.end();
  }
}