import { config } from 'dotenv';
import { defineConfig } from 'drizzle-kit';

config({ path: '.env.migrations', quiet: true });

const migrationUrl = process.env.MIGRATION_DATABASE_URL;

if (!migrationUrl) {
  throw new Error('MIGRATION_DATABASE_URL is required.');
}

export default defineConfig({
  dialect: 'postgresql',
  out: './drizzle',
  schema: './src/infrastructure/database/schema.ts',
  dbCredentials: {
    url: migrationUrl,
  },
  schemaFilter: [
    'core',
    'iam',
    'care',
    'agenda',
    'evaluation',
    'practicum',
    'projects',
    'quality',
    'archive',
    'reporting',
    'audit',
  ],
  introspect: {
    casing: 'camel',
  },
});