import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type { databaseSchema } from './database.schema.js';

export type AppDatabase = NodePgDatabase<typeof databaseSchema>;
export type AppTransaction = Parameters<Parameters<AppDatabase['transaction']>[0]>[0];
