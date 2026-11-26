import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import {
  afterAll as after,
  afterEach,
  beforeAll as before,
  beforeEach,
  test,
} from 'vitest';
import { PasswordHasher } from '@nestjs/authentication';
import { BootstrapAdministrator } from '../src/modules/identity/application/bootstrap-administrator.js';
import { PostgresIdentityBootstrapStore } from '../src/modules/identity/infrastructure/postgres-identity-bootstrap.store.js';

const require = createRequire(new URL('../package.json', import.meta.url));
const { Client, Pool } = require('pg');
const { drizzle } = require('drizzle-orm/node-postgres');
const { migrate } = require('drizzle-orm/node-postgres/migrator');
const localUrl = new URL(
  process.env.TEST_DATABASE_URL ?? 'http://missing-test-database',
);
assert.equal(localUrl.protocol, 'postgresql:');
assert.ok(['127.0.0.1', 'localhost'].includes(localUrl.hostname));
assert.equal(localUrl.pathname, '/postgres');
const admin = new Client({ connectionString: localUrl.toString() });
// Production uses the package's stronger default; reduce cost only for test fixtures.
const hasher = new PasswordHasher({ logN: 10 });
const input = {
  givenNames: 'Test',
  familyNames: 'Administrator',
  email: 'admin@example.test',
  password: 'A long test passphrase',
};
let pool;
let databaseName;
let ownerUrl;
let store;
let useCase;

before(() => admin.connect());
beforeEach(async () => {
  databaseName = `identity_test_${randomUUID().replaceAll('-', '')}`;
  await admin.query(`CREATE DATABASE "${databaseName}"`);
  ownerUrl = new URL(localUrl);
  ownerUrl.pathname = `/${databaseName}`;
  pool = new Pool({ connectionString: ownerUrl.toString(), max: 2 });
  await migrate(drizzle(pool), {
    migrationsFolder: fileURLToPath(new URL('../drizzle/', import.meta.url)),
  });
  store = new PostgresIdentityBootstrapStore(drizzle(pool));
  useCase = new BootstrapAdministrator(store, hasher);
});
afterEach(async () => {
  if (pool) await pool.end();
  if (databaseName) await admin.query(`DROP DATABASE "${databaseName}"`);
});
after(() => admin.end());

async function identityCounts() {
  const { rows } = await pool.query(`SELECT
    (SELECT count(*)::integer FROM iam.account) AS accounts,
    (SELECT count(*)::integer FROM iam.role) AS roles,
    (SELECT count(*)::integer FROM iam.permission) AS permissions,
    (SELECT count(*)::integer FROM iam.role_permission) AS grants,
    (SELECT count(*)::integer FROM core.person) AS people,
    (SELECT count(*)::integer FROM audit.change_event) AS events`);
  return rows[0];
}

test('creates the first active administrator, verifies its hash and grants exactly the approved identity permissions', async () => {
  const result = await useCase.execute(input);
  assert.deepEqual(Object.keys(result).sort(), [
    'accountId',
    'email',
    'personId',
    'roleCode',
  ]);
  const {
    rows: [account],
  } = await pool.query('SELECT * FROM iam.account WHERE id=$1', [
    result.accountId,
  ]);
  assert.equal(account.account_status, 'active');
  assert.equal(account.person_id, result.personId);
  assert.notEqual(account.password_hash, input.password);
  assert.equal(
    await hasher.verify(input.password, account.password_hash),
    true,
  );
  assert.equal(
    await hasher.verify('incorrect password', account.password_hash),
    false,
  );
  const { rows } = await pool.query(
    'SELECT permission_code FROM iam.v_effective_permission WHERE account_id=$1 ORDER BY permission_code',
    [result.accountId],
  );
  assert.deepEqual(
    rows.map((row) => row.permission_code),
    [
      'accounts.invite_director_candidate',
      'accounts.read',
      'audit.read_identity',
      'credentials.issue_director_reset',
      'director.assign',
      'director.disable',
      'director.reinvite',
      'roles.read',
    ],
  );
  const counts = await identityCounts();
  assert.deepEqual(
    { ...counts, events: undefined },
    {
      accounts: 1,
      roles: 5,
      permissions: 15,
      grants: 18,
      people: 1,
      events: undefined,
    },
  );
  const roles =
    await pool.query(`SELECT r.code, count(rp.id)::integer AS grant_count
    FROM iam.role r LEFT JOIN iam.role_permission rp ON rp.role_id=r.id AND rp.revoked_at IS NULL
    GROUP BY r.code ORDER BY r.code`);
  assert.deepEqual(roles.rows, [
    { code: 'administrator', grant_count: 8 },
    { code: 'assistant', grant_count: 0 },
    { code: 'degree_student', grant_count: 0 },
    { code: 'director', grant_count: 10 },
    { code: 'psychologist', grant_count: 0 },
  ]);
  const directorPermissions =
    await pool.query(`SELECT p.code FROM iam.role_permission rp
    JOIN iam.role r ON r.id=rp.role_id JOIN iam.permission p ON p.id=rp.permission_id
    WHERE r.code='director' ORDER BY p.code`);
  assert.deepEqual(
    directorPermissions.rows.map((row) => row.code),
    [
      'accounts.disable_operational',
      'accounts.invite_operational',
      'accounts.read',
      'accounts.reinvite_operational',
      'accounts.update_operational',
      'audit.read_identity',
      'credentials.issue_operational_reset',
      'roles.assign_operational',
      'roles.read',
      'roles.revoke_operational',
    ],
  );
  const sessions = await pool.query(
    'SELECT count(*)::integer AS count FROM iam.auth_session',
  );
  assert.equal(sessions.rows[0].count, 0);
});

test('attributes the entire setup to one system request without recording the password or its hash', async () => {
  await useCase.execute(input);
  const events = await pool.query('SELECT * FROM audit.change_event');
  assert.equal(events.rowCount, 41);
  assert.equal(new Set(events.rows.map((row) => row.request_id)).size, 1);
  for (const event of events.rows) {
    assert.equal(event.actor_kind, 'system');
    assert.equal(event.system_actor, 'bootstrap-first-admin');
    assert.equal(event.actor_account_id, null);
    assert.equal(event.auth_session_id, null);
  }
  assert.equal(JSON.stringify(events.rows).includes(input.password), false);
  assert.equal(JSON.stringify(events.rows).includes('$scrypt$'), false);
});

test('rejects a second setup and preserves the existing password, grants and audit history', async () => {
  await useCase.execute(input);
  const beforeCounts = await identityCounts();
  const {
    rows: [beforeAccount],
  } = await pool.query('SELECT * FROM iam.account');
  await assert.rejects(
    useCase.execute({ ...input, password: 'A different long password' }),
    /already initialized/,
  );
  assert.deepEqual(await identityCounts(), beforeCounts);
  const {
    rows: [afterAccount],
  } = await pool.query('SELECT * FROM iam.account');
  assert.deepEqual(afterAccount, beforeAccount);
});

test('serializes concurrent initializations so only one account and one catalog commit', async () => {
  const results = await Promise.allSettled([
    useCase.execute(input),
    useCase.execute({ ...input, email: 'other@example.test' }),
  ]);
  assert.equal(
    results.filter((result) => result.status === 'fulfilled').length,
    1,
  );
  const failed = results.find((result) => result.status === 'rejected');
  assert.match(failed.reason.message, /already initialized/);
  assert.equal((await identityCounts()).accounts, 1);
  assert.equal((await identityCounts()).grants, 18);
});

test('stops on a partial catalog without adding accounts or silently changing permissions', async () => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      "SELECT audit.set_system_context('partial-install-test', $1)",
      [randomUUID()],
    );
    await client.query(
      "INSERT INTO iam.role(code,label) VALUES ('administrator','Existing role')",
    );
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
  const beforeCounts = await identityCounts();
  await assert.rejects(useCase.execute(input), /already initialized/);
  assert.deepEqual(await identityCounts(), beforeCounts);
});

test('rolls back the person, account, catalog and audit events if the final role grant fails', async () => {
  await pool.query(`CREATE FUNCTION iam.reject_test_grant() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN RAISE EXCEPTION 'Simulated final grant failure'; END $$;
    CREATE TRIGGER reject_test_grant BEFORE INSERT ON iam.account_role
    FOR EACH ROW EXECUTE FUNCTION iam.reject_test_grant()`);
  await assert.rejects(useCase.execute(input));
  assert.deepEqual(await identityCounts(), {
    accounts: 0,
    roles: 0,
    permissions: 0,
    grants: 0,
    people: 0,
    events: 0,
  });
});

test('does not initialize identity with the restricted runtime database role', async () => {
  const role = `identity_runtime_${randomUUID().replaceAll('-', '')}`;
  const password = randomBytes(32).toString('hex');
  await admin.query(
    `CREATE ROLE "${role}" LOGIN PASSWORD '${password}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS`,
  );
  const runtimeUrl = new URL(ownerUrl);
  runtimeUrl.username = role;
  runtimeUrl.password = password;
  const runtimePool = new Pool({ connectionString: runtimeUrl.toString() });
  try {
    await pool.query(`GRANT USAGE ON SCHEMA core, iam, audit TO "${role}"`);
    await pool.query(
      `GRANT SELECT, INSERT ON ALL TABLES IN SCHEMA core, iam TO "${role}"`,
    );
    const runtimeStore = new PostgresIdentityBootstrapStore(
      drizzle(runtimePool),
    );
    await assert.rejects(
      new BootstrapAdministrator(runtimeStore, hasher).execute(input),
    );
    assert.equal((await identityCounts()).accounts, 0);
    assert.equal((await identityCounts()).events, 0);
  } finally {
    await runtimePool.end();
    await pool.query(`DROP OWNED BY "${role}"`);
    await admin.query(`DROP ROLE "${role}"`);
  }
});
