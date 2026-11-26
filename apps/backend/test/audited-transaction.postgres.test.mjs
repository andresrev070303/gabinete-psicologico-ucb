import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { after, before, test } from 'node:test';
import { AuditedTransaction } from '../dist/infrastructure/database/audited-transaction.js';

const require = createRequire(new URL('../package.json', import.meta.url));
const { Client, Pool } = require('pg');
const { drizzle } = require('drizzle-orm/node-postgres');
const { migrate } = require('drizzle-orm/node-postgres/migrator');
const { sql } = require('drizzle-orm');

// The runner supplies a private local instance, never DATABASE_URL from .env.
const localUrl = new URL(process.env.TEST_DATABASE_URL ?? 'http://missing-test-database');
assert.equal(localUrl.protocol, 'postgresql:');
assert.ok(['127.0.0.1', 'localhost'].includes(localUrl.hostname));
assert.equal(localUrl.pathname, '/postgres');
const suffix = randomUUID().replaceAll('-', '');
const databaseName = `gabinete_test_${suffix}`;
const runtimeRole = `runtime_test_${suffix}`;
const admin = new Client({ connectionString: localUrl.toString() });
const actors = [0, 1].map(() => ({ accountId: randomUUID(), authSessionId: randomUUID(), requestId: randomUUID() }));
let ownerPool;
let runtimePool;
let transactions;
let databaseCreated = false;
let roleCreated = false;

before(async () => {
  await admin.connect();
  await admin.query(`CREATE DATABASE "${databaseName}"`);
  databaseCreated = true;
  const ownerUrl = new URL(localUrl);
  ownerUrl.pathname = `/${databaseName}`;
  ownerPool = new Pool({ connectionString: ownerUrl.toString() });
  await migrate(drizzle(ownerPool), {
    migrationsFolder: fileURLToPath(new URL('../drizzle/', import.meta.url)),
  });
  await admin.query(`CREATE ROLE "${runtimeRole}" LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS`);
  roleCreated = true;
  await ownerPool.query(`GRANT USAGE ON SCHEMA core, iam, audit TO "${runtimeRole}"`);
  await ownerPool.query(`GRANT SELECT, INSERT ON core.person TO "${runtimeRole}"`);
  await ownerPool.query(`GRANT EXECUTE ON FUNCTION audit.set_request_context(uuid, uuid, uuid) TO "${runtimeRole}"`);
  const seed = await ownerPool.connect();
  try {
    await seed.query('BEGIN');
    await seed.query("SELECT audit.set_system_context('identity-tests', $1)", [randomUUID()]);
    for (const [index, actor] of actors.entries()) {
      const person = await seed.query("INSERT INTO core.person(given_names, family_names) VALUES ('Test', 'Actor') RETURNING id");
      await seed.query(
        'INSERT INTO iam.account(id, person_id, email) VALUES ($1, $2, $3)',
        [actor.accountId, person.rows[0].id, `actor-${index}@example.test`],
      );
      await seed.query(
        "INSERT INTO iam.auth_session(id, account_id, token_hash, expires_at) VALUES ($1, $2, $3, clock_timestamp() + interval '1 hour')",
        [actor.authSessionId, actor.accountId, randomBytes(32)],
      );
    }
    await seed.query('COMMIT');
  } catch (error) {
    await seed.query('ROLLBACK');
    throw error;
  } finally {
    seed.release();
  }
  const runtimeUrl = new URL(ownerUrl);
  runtimeUrl.username = runtimeRole;
  runtimeUrl.password = '';
  runtimePool = new Pool({ connectionString: runtimeUrl.toString(), max: 2 });
  transactions = new AuditedTransaction(drizzle(runtimePool));
});

after(async () => {
  if (runtimePool) await runtimePool.end();
  if (ownerPool) await ownerPool.end();
  try {
    if (databaseCreated) await admin.query(`DROP DATABASE "${databaseName}"`);
    if (roleCreated) await admin.query(`DROP ROLE "${runtimeRole}"`);
  } finally {
    await admin.end();
  }
});

const insertPerson = (tx, id) => tx.execute(sql`
  INSERT INTO core.person(id, given_names, family_names) VALUES (${id}::uuid, 'Test', 'Person')
`);

function hasPgCode(error, expected) {
  return error?.code === expected || error?.cause?.code === expected;
}

void test('commits the change and attributes its audit event to the verified context', async () => {
  const id = randomUUID();
  const result = await transactions.run(actors[0], async (tx) => {
    await insertPerson(tx, id);
    return 'committed';
  });
  assert.equal(result, 'committed');
  const person = await ownerPool.query('SELECT created_by_account_id FROM core.person WHERE id=$1', [id]);
  assert.equal(person.rows[0].created_by_account_id, actors[0].accountId);
  const events = await ownerPool.query('SELECT actor_account_id, auth_session_id, request_id FROM audit.change_event WHERE row_id=$1', [id]);
  assert.deepEqual(events.rows, [{ actor_account_id: actors[0].accountId, auth_session_id: actors[0].authSessionId, request_id: actors[0].requestId }]);
});

void test('rolls back the business change and audit event when the use case fails', async () => {
  const id = randomUUID();
  const failure = new Error('Use case rejected');
  await assert.rejects(transactions.run(actors[0], async (tx) => {
    await insertPerson(tx, id);
    throw failure;
  }), (error) => error === failure);
  assert.equal((await ownerPool.query('SELECT 1 FROM core.person WHERE id=$1', [id])).rowCount, 0);
  assert.equal((await ownerPool.query('SELECT 1 FROM audit.change_event WHERE row_id=$1', [id])).rowCount, 0);
});

void test('does not retain the audit context when a pooled connection is reused', async () => {
  const singlePool = new Pool({ ...runtimePool.options, max: 1 });
  try {
    const runner = new AuditedTransaction(drizzle(singlePool));
    await runner.run(actors[0], async (tx) => { await insertPerson(tx, randomUUID()); });
    await assert.rejects(
      singlePool.query("INSERT INTO core.person(given_names, family_names) VALUES ('No', 'Context')"),
      (error) => hasPgCode(error, '22023'),
    );
  } finally {
    await singlePool.end();
  }
});

void test('rejects an account and session that do not belong together', async () => {
  await assert.rejects(
    transactions.run({ ...actors[0], authSessionId: actors[1].authSessionId }, (tx) => insertPerson(tx, randomUUID())),
    (error) => hasPgCode(error, '22023'),
  );
});

void test('keeps two concurrent audit contexts isolated', async () => {
  const ids = actors.map(() => randomUUID());
  let reached = 0;
  let release;
  const barrier = new Promise((resolve) => { release = resolve; });
  await Promise.all(actors.map((actor, index) => transactions.run(actor, async (tx) => {
    reached += 1;
    if (reached === actors.length) release();
    await barrier;
    await insertPerson(tx, ids[index]);
  })));
  for (const [index, id] of ids.entries()) {
    const event = await ownerPool.query('SELECT actor_account_id, request_id FROM audit.change_event WHERE row_id=$1', [id]);
    assert.deepEqual(event.rows, [{ actor_account_id: actors[index].accountId, request_id: actors[index].requestId }]);
  }
});

void test('the runtime role cannot insert or rewrite audit events directly', async () => {
  for (const query of ['INSERT INTO audit.change_event DEFAULT VALUES', "UPDATE audit.change_event SET operation='DELETE'"]) {
    await assert.rejects(runtimePool.query(query), (error) => hasPgCode(error, '42501'));
  }
});

void test('the runtime role cannot impersonate the system actor', async () => {
  await assert.rejects(
    runtimePool.query("SELECT audit.set_system_context('forged', $1)", [randomUUID()]),
    (error) => hasPgCode(error, '42501'),
  );
});
