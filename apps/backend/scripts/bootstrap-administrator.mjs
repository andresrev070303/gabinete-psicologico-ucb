import { emitKeypressEvents } from 'node:readline';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { config } from 'dotenv';
import { PasswordHasher } from '@nestjs/authentication';
import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { BootstrapAdministrator } from '../dist/modules/identity/application/bootstrap-administrator.js';
import { assertBootstrapConnection } from '../dist/modules/identity/infrastructure/bootstrap-connection.js';
import { PostgresIdentityBootstrapStore } from '../dist/modules/identity/infrastructure/postgres-identity-bootstrap.store.js';
import { databaseSchema } from '../dist/infrastructure/database/database.schema.js';

function readSecret(prompt) {
  stdout.write(prompt);
  emitKeypressEvents(stdin);
  const previousRawMode = stdin.isRaw;
  return new Promise((resolve, reject) => {
    let value = '';
    const finish = (error) => {
      stdin.off('keypress', onKey);
      stdin.setRawMode(previousRawMode ?? false);
      stdin.pause();
      stdout.write('\n');
      if (error) reject(error);
      else resolve(value);
    };
    const onKey = (characters, key) => {
      if (key?.ctrl && key.name === 'c') finish(new Error('Setup cancelled.'));
      else if (key?.name === 'return' || key?.name === 'enter') finish();
      else if (key?.name === 'backspace')
        value = Array.from(value).slice(0, -1).join('');
      else if (
        characters &&
        !key?.ctrl &&
        !key?.meta &&
        !/[\u0000-\u001f\u007f]/u.test(characters)
      )
        value += characters;
    };
    stdin.setRawMode(true);
    stdin.on('keypress', onKey);
    stdin.resume();
  });
}

async function main() {
  if (!stdin.isTTY || !stdout.isTTY)
    throw new Error('Run this command in an interactive local terminal.');
  config({ path: '.env.migrations', quiet: true });
  const connectionString = process.env.MIGRATION_DATABASE_URL;
  assertBootstrapConnection(connectionString);
  stdout.write(
    'Confirm the connection was copied from Neon: development / gabinete_ucb / owner, pooling OFF.\n',
  );
  stdout.write(
    'This installs the first administrator and identity catalog. It does not start a web session.\n',
  );
  const terminal = createInterface({ input: stdin, output: stdout });
  let givenNames;
  let familyNames;
  let email;
  try {
    const confirmation = await terminal.question(
      'Type development/gabinete_ucb to continue: ',
    );
    if (confirmation !== 'development/gabinete_ucb')
      throw new Error('Setup cancelled.');
    givenNames = await terminal.question('Administrator given names: ');
    familyNames = await terminal.question('Administrator family names: ');
    email = await terminal.question('Administrator email: ');
  } finally {
    terminal.close();
  }
  const password = await readSecret(
    'Password (15-128 characters, input hidden): ',
  );
  const confirmation = await readSecret('Repeat password (input hidden): ');
  if (password !== confirmation) throw new Error('The passwords do not match.');
  const pool = new Pool({
    connectionString,
    max: 1,
    connectionTimeoutMillis: 10000,
    query_timeout: 20000,
  });
  try {
    const store = new PostgresIdentityBootstrapStore(
      drizzle(pool, { schema: databaseSchema }),
    );
    const useCase = new BootstrapAdministrator(store, new PasswordHasher());
    const identity = await useCase.execute({
      givenNames,
      familyNames,
      email,
      password,
    });
    await pool.query('SELECT practicum.install_access_catalog()');
    await pool.query('SELECT projects.install_access_catalog()');
    stdout.write(
      `Administrator created: ${identity.email}\nAccount ID: ${identity.accountId}\n`,
    );
    stdout.write(
      'Expected totals: 1 account, 5 roles, 22 permissions, 32 role-permission grants.\n',
    );
  } finally {
    await pool.end();
  }
}

try {
  await main();
} catch (error) {
  // Database errors can contain connection details or parameters. Do not print their causes.
  const safeMessage =
    error instanceof Error && !('cause' in error) && !('code' in error)
      ? error.message
      : 'Database setup failed. Check the branch, owner privileges and schema; existing data was preserved.';
  console.error(safeMessage);
  process.exitCode = 1;
}
