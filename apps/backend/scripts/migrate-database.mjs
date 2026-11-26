import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { config } from 'dotenv';
import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { assertBootstrapConnection } from '../dist/modules/identity/infrastructure/bootstrap-connection.js';

config({ path: '.env.migrations', quiet: true });
let pool;
try {
  const connectionString = process.env.MIGRATION_DATABASE_URL;
  assertBootstrapConnection(connectionString);
  pool = new Pool({ connectionString, max: 1, connectionTimeoutMillis: 10000 });
  const journal = JSON.parse(
    await readFile(
      new URL('../drizzle/meta/_journal.json', import.meta.url),
      'utf8',
    ),
  );
  const expected = [];
  for (const entry of journal.entries) {
    const content = await readFile(
      new URL(`../drizzle/${entry.tag}.sql`, import.meta.url),
      'utf8',
    );
    expected.push({
      hash: createHash('sha256').update(content).digest('hex'),
      when: entry.when,
    });
  }
  const exists = await pool.query(
    "SELECT to_regclass('drizzle.__drizzle_migrations') AS history",
  );
  if (!exists.rows[0].history)
    throw new Error(
      'Baseline history is missing. Stop and register the existing schema before migrating.',
    );
  const history = await pool.query(
    'SELECT hash,created_at FROM drizzle.__drizzle_migrations ORDER BY created_at',
  );
  if (history.rows.length === 0)
    throw new Error(
      'Baseline history is empty. The initial schema must not be executed again.',
    );
  for (const [index, row] of history.rows.entries()) {
    if (
      expected[index]?.hash !== row.hash ||
      expected[index]?.when !== Number(row.created_at)
    )
      throw new Error(
        'Migration history does not match this repository. Review the baseline before continuing.',
      );
  }
  await migrate(drizzle(pool), {
    migrationsFolder: fileURLToPath(new URL('../drizzle/', import.meta.url)),
  });
  console.log(
    'Database migrations completed. Existing accounts and grants were preserved.',
  );
} catch (error) {
  const message =
    error instanceof Error && !('cause' in error) && !('code' in error)
      ? error.message
      : 'Migration failed. Check the owner connection and migration history. No credentials were logged.';
  console.error(message);
  process.exitCode = 1;
} finally {
  await pool?.end();
}
