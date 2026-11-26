import { randomBytes, randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { Pool, Client } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Test } from '@nestjs/testing';
import { PasswordHasher } from '@nestjs/authentication';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, expect, test, vi } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { DatabaseService } from '../src/infrastructure/database/database.service.js';
import { databaseSchema } from '../src/infrastructure/database/database.schema.js';
import { BootstrapAdministrator } from '../src/modules/identity/application/bootstrap-administrator.js';
import { PostgresIdentityBootstrapStore } from '../src/modules/identity/infrastructure/postgres-identity-bootstrap.store.js';
import { PostgresAuthenticationStore } from '../src/modules/identity/infrastructure/postgres-authentication.store.js';
import { SessionTokens } from '../src/modules/identity/infrastructure/session-tokens.js';
import { configureApplication } from '../src/configure-application.js';

const local = new URL(
  process.env.TEST_DATABASE_URL ?? 'http://missing-test-database',
);
if (
  local.protocol !== 'postgresql:' ||
  !['127.0.0.1', 'localhost'].includes(local.hostname) ||
  local.pathname !== '/postgres'
)
  throw new Error('A private local PostgreSQL test instance is required.');
const admin = new Client({ connectionString: local.toString() });
const databaseName = `auth_test_${randomUUID().replaceAll('-', '')}`;
const role = `auth_runtime_${randomUUID().replaceAll('-', '')}`;
const rolePassword = randomBytes(32).toString('hex');
const passwords = new PasswordHasher({ logN: 10 });
const password = 'A long test passphrase';
const tokens = new SessionTokens();
const origin = 'http://localhost:5173';
let owner;
let runtime;
let app;
let email;
let accountId;
let databaseCreated = false;
let roleCreated = false;
let preservedAccount;
let legacySessionId;
const migrationsFolder = fileURLToPath(new URL('../drizzle/', import.meta.url));

async function system(work) {
  const client = await owner.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      "SELECT audit.set_system_context('authentication-tests',$1)",
      [randomUUID()],
    );
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
async function createApp() {
  const module = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(DatabaseService)
    .useValue({
      db: drizzle(runtime, { schema: databaseSchema }),
      checkConnection: async () => {},
    })
    .overrideProvider(PasswordHasher)
    .useValue(passwords)
    .compile();
  const instance = module.createNestApplication();
  configureApplication(instance, [origin]);
  await instance.init();
  return instance;
}
function login(instance = app, address = email, secret = password) {
  return request(instance.getHttpServer())
    .post('/auth/sign-in')
    .set('Origin', origin)
    .send({ email: address, password: secret });
}
function cookie(response) {
  return response.headers['set-cookie'][0].split(';')[0];
}
function me(value, instance = app) {
  return request(instance.getHttpServer()).get('/auth/me').set('Cookie', value);
}

beforeAll(async () => {
  await admin.connect();
  await admin.query(`CREATE DATABASE "${databaseName}"`);
  databaseCreated = true;
  const url = new URL(local);
  url.pathname = `/${databaseName}`;
  owner = new Pool({ connectionString: url.toString(), max: 3 });
  // Reproduce an existing installation: baseline, administrator, then the additive migration.
  const journal = JSON.parse(
    await readFile(
      new URL('../drizzle/meta/_journal.json', import.meta.url),
      'utf8',
    ),
  );
  const baseline = new URL(
    `../.work/auth-baseline-${databaseName}/`,
    import.meta.url,
  );
  await mkdir(new URL('meta/', baseline), { recursive: true });
  await writeFile(
    new URL('meta/_journal.json', baseline),
    JSON.stringify({ ...journal, entries: journal.entries.slice(0, 1) }),
  );
  await writeFile(
    new URL(`${journal.entries[0].tag}.sql`, baseline),
    await readFile(
      new URL(`../drizzle/${journal.entries[0].tag}.sql`, import.meta.url),
    ),
  );
  await migrate(drizzle(owner), { migrationsFolder: fileURLToPath(baseline) });
  await new BootstrapAdministrator(
    new PostgresIdentityBootstrapStore(drizzle(owner)),
    passwords,
  ).execute({
    givenNames: 'Test',
    familyNames: 'Bootstrap',
    email: 'bootstrap@example.test',
    password,
  });
  preservedAccount = (
    await owner.query(
      "SELECT id,password_hash FROM iam.account WHERE email='bootstrap@example.test'",
    )
  ).rows[0];
  legacySessionId = await system(
    async (client) =>
      (
        await client.query(
          "INSERT INTO iam.auth_session(account_id,token_hash,expires_at) VALUES($1,$2,clock_timestamp()+interval '1 hour') RETURNING id",
          [preservedAccount.id, tokens.issue().hash],
        )
      ).rows[0].id,
  );
  await migrate(drizzle(owner), { migrationsFolder });
  await admin.query(
    `CREATE ROLE "${role}" LOGIN PASSWORD '${rolePassword}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS`,
  );
  roleCreated = true;
  await owner.query(`GRANT USAGE ON SCHEMA core,iam,audit TO "${role}"`);
  await owner.query(
    `GRANT SELECT ON ALL TABLES IN SCHEMA core,iam,audit TO "${role}"`,
  );
  await owner.query(
    `GRANT INSERT,UPDATE ON iam.auth_session,iam.account TO "${role}"`,
  );
  await owner.query(
    `GRANT EXECUTE ON FUNCTION audit.set_request_context(uuid,uuid,uuid),audit.record_auth_event(uuid,text,bytea,uuid,uuid) TO "${role}"`,
  );
  url.username = role;
  url.password = rolePassword;
  runtime = new Pool({ connectionString: url.toString(), max: 5 });
  app = await createApp();
});
beforeEach(async () => {
  email = `account-${randomUUID()}@example.test`;
  accountId = await system(async (client) => {
    const person = await client.query(
      "INSERT INTO core.person(given_names,family_names) VALUES('Test','Account') RETURNING id",
    );
    const account = await client.query(
      "INSERT INTO iam.account(person_id,email,password_hash,account_status) VALUES($1,$2,$3,'active') RETURNING id",
      [person.rows[0].id, email, await passwords.hash(password)],
    );
    await client.query(
      "INSERT INTO iam.account_role(account_id,role_id) SELECT $1,id FROM iam.role WHERE code='administrator'",
      [account.rows[0].id],
    );
    return account.rows[0].id;
  });
});
afterAll(async () => {
  await app?.close();
  await runtime?.end();
  await owner?.end();
  try {
    if (databaseCreated) await admin.query(`DROP DATABASE "${databaseName}"`);
    if (roleCreated) await admin.query(`DROP ROLE "${role}"`);
  } finally {
    await admin.end();
  }
});

test('upgrades an existing installation without replacing the administrator, password, grants or legacy session', async () => {
  const account = (
    await owner.query('SELECT id,password_hash FROM iam.account WHERE id=$1', [
      preservedAccount.id,
    ])
  ).rows[0];
  expect(account).toEqual(preservedAccount);
  const catalog = (
    await owner.query(
      'SELECT (SELECT count(*)::int FROM iam.role) AS roles,(SELECT count(*)::int FROM iam.permission) AS permissions,(SELECT count(*)::int FROM iam.role_permission) AS grants',
    )
  ).rows[0];
  expect(catalog).toEqual({ roles: 5, permissions: 15, grants: 18 });
  const session = (
    await owner.query(
      'SELECT account_id,session_kind FROM iam.auth_session WHERE id=$1',
      [legacySessionId],
    )
  ).rows[0];
  expect(session).toEqual({
    account_id: preservedAccount.id,
    session_kind: 'interactive',
  });
  await migrate(drizzle(owner), { migrationsFolder });
  expect(
    (
      await owner.query(
        'SELECT count(*)::int AS count FROM drizzle.__drizzle_migrations',
      )
    ).rows[0].count,
  ).toBe(2);
});

test('signs in with a private cookie, stores only its hash and attributes the session and login to the new session', async () => {
  const response = await login().expect(200);
  expect(response.headers['cache-control']).toBe('no-store');
  expect(response.headers['set-cookie'][0]).toContain('HttpOnly');
  expect(response.headers['set-cookie'][0]).toContain('SameSite=Lax');
  expect(response.headers['set-cookie'][0]).not.toContain('Domain=');
  expect(response.body.identity).toMatchObject({
    accountId,
    email,
    roles: ['administrator'],
  });
  expect(response.body.identity.permissions).toHaveLength(8);
  expect(Object.keys(response.body.identity).sort()).toEqual([
    'accountId',
    'email',
    'familyNames',
    'givenNames',
    'permissions',
    'roles',
  ]);
  const raw = cookie(response).split('=')[1];
  expect(JSON.stringify(response.body)).not.toContain(raw);
  expect(JSON.stringify(response.body)).not.toContain('password');
  const row = (
    await owner.query('SELECT token_hash FROM iam.auth_session WHERE id=$1', [
      response.body.session.id,
    ])
  ).rows[0];
  expect(row.token_hash.equals(tokens.hash(raw))).toBe(true);
  const event = (
    await owner.query(
      "SELECT actor_account_id,auth_session_id FROM audit.security_event WHERE actor_account_id=$1 AND event_type='sign_in_succeeded'",
      [accountId],
    )
  ).rows[0];
  expect(event).toEqual({
    actor_account_id: accountId,
    auth_session_id: response.body.session.id,
  });
  const audits = await owner.query(
    'SELECT actor_account_id,auth_session_id FROM audit.change_event WHERE row_id=$1',
    [response.body.session.id],
  );
  expect(audits.rows[0]).toEqual(event);
});

test('answers unknown email, wrong password, invited and disabled accounts with the same response', async () => {
  const wrong = await login(app, email, 'incorrect').expect(401);
  const unknown = await login(app, 'missing@example.test', 'incorrect').expect(
    401,
  );
  expect(unknown.body).toEqual(wrong.body);
  for (const status of ['invited', 'disabled']) {
    await system((client) =>
      client.query('UPDATE iam.account SET account_status=$1 WHERE id=$2', [
        status,
        accountId,
      ]),
    );
    const rejected = await login().expect(401);
    expect(rejected.body).toEqual(wrong.body);
    expect(rejected.headers['set-cookie']).toBeUndefined();
  }
  const events = await owner.query(
    "SELECT actor_account_id,auth_session_id FROM audit.security_event WHERE event_type='sign_in_failed'",
  );
  expect(
    events.rows.every(
      (event) =>
        event.actor_account_id === null && event.auth_session_id === null,
    ),
  ).toBe(true);
});

test('requires a valid credential for identity and does not accept the session UUID as a credential', async () => {
  await request(app.getHttpServer()).get('/auth/me').expect(401);
  const signed = await login().expect(200);
  await me(`gabinete_session=${signed.body.session.id}`).expect(401);
  await me('gabinete_session=invalid').expect(401);
  const response = await me(cookie(signed)).expect(200);
  expect(response.body.identity.accountId).toBe(accountId);
  expect(response.headers['cache-control']).toBe('no-store');
});

test('revokes sign-out persistently, clears the cookie and rejects later requests using the old token', async () => {
  const signed = await login().expect(200);
  const result = await request(app.getHttpServer())
    .post('/auth/sign-out')
    .set('Origin', origin)
    .set('Cookie', cookie(signed))
    .expect(204);
  expect(result.headers['set-cookie'][0]).toContain('Expires=Thu, 01 Jan 1970');
  await me(cookie(signed)).expect(401);
  const row = (
    await owner.query(
      'SELECT revoked_at,revocation_reason FROM iam.auth_session WHERE id=$1',
      [signed.body.session.id],
    )
  ).rows[0];
  expect(row.revoked_at).not.toBeNull();
  expect(row.revocation_reason).toBe('signed_out');
});

test('keeps the persisted session valid after the application is recreated', async () => {
  const signed = await login().expect(200);
  const second = await createApp();
  try {
    await me(cookie(signed), second).expect(200);
  } finally {
    await second.close();
  }
});

test('enforces the maximum of two sessions and revokes the oldest', async () => {
  const first = await login().expect(200);
  const second = await login().expect(200);
  const third = await login().expect(200);
  await me(cookie(first)).expect(401);
  await me(cookie(second)).expect(200);
  await me(cookie(third)).expect(200);
});

test('rotates the credential when the same browser signs in again', async () => {
  const first = await login().expect(200);
  const second = await request(app.getHttpServer())
    .post('/auth/sign-in')
    .set('Origin', origin)
    .set('Cookie', cookie(first))
    .send({ email, password })
    .expect(200);
  expect(cookie(second)).not.toBe(cookie(first));
  await me(cookie(first)).expect(401);
  await me(cookie(second)).expect(200);
});

test.each(['expired', 'idle', 'revoked', 'action_only'])(
  'rejects %s sessions',
  async (kind) => {
    const secret = tokens.issue();
    await system((client) =>
      client.query(
        `INSERT INTO iam.auth_session(account_id,token_hash,session_kind,created_at,expires_at,revoked_at)
    VALUES($1,$2,$3,clock_timestamp()-interval '1 hour',
      ${kind === 'expired' ? "clock_timestamp()-interval '1 minute'" : "clock_timestamp()+interval '1 hour'"},
      ${kind === 'revoked' || kind === 'action_only' ? 'clock_timestamp()' : 'NULL'})`,
        [
          accountId,
          secret.hash,
          kind === 'action_only' ? 'password_reset' : 'interactive',
        ],
      ),
    );
    await me(`gabinete_session=${secret.token}`).expect(401);
  },
);

test('rejects active sessions after the account is disabled', async () => {
  const signed = await login().expect(200);
  await system((client) =>
    client.query(
      "UPDATE iam.account SET account_status='disabled' WHERE id=$1",
      [accountId],
    ),
  );
  await me(cookie(signed)).expect(401);
});

test('reads the current permissions rather than keeping them in a token', async () => {
  const signed = await login().expect(200);
  const client = await owner.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT audit.set_request_context($1,$2,$3)', [
      accountId,
      signed.body.session.id,
      randomUUID(),
    ]);
    await client.query(
      'UPDATE iam.account_role SET revoked_at=clock_timestamp() WHERE account_id=$1 AND revoked_at IS NULL',
      [accountId],
    );
    await client.query('COMMIT');
  } finally {
    client.release();
  }
  const response = await me(cookie(signed)).expect(200);
  expect(response.body.identity.roles).toEqual([]);
  expect(response.body.identity.permissions).toEqual([]);
});

test('persists the failure limit across application instances and returns 429 on the sixth attempt', async () => {
  for (let i = 0; i < 5; i++) await login(app, email, 'incorrect').expect(401);
  const second = await createApp();
  try {
    const result = await login(second).expect(429);
    expect(result.headers['retry-after']).toBe('900');
  } finally {
    await second.close();
  }
});

test('rejects cross-origin sign-in and sign-out before changing data', async () => {
  await request(app.getHttpServer())
    .post('/auth/sign-in')
    .set('Origin', 'https://foreign.example')
    .set('Sec-Fetch-Site', 'cross-site')
    .send({ email, password })
    .expect(403);
  expect(
    (
      await owner.query(
        'SELECT count(*)::integer AS n FROM iam.auth_session WHERE account_id=$1',
        [accountId],
      )
    ).rows[0].n,
  ).toBe(0);
  const signed = await login().expect(200);
  await request(app.getHttpServer())
    .post('/auth/sign-out')
    .set('Origin', 'https://foreign.example')
    .set('Sec-Fetch-Site', 'cross-site')
    .set('Cookie', cookie(signed))
    .expect(403);
  await me(cookie(signed)).expect(200);
});

test.each([
  {},
  { email: 'bad', password: 'value' },
  { email: 23, password: 'value' },
  { email: 'valid@example.test', password: null },
  { email: 'valid@example.test', password: 'value', role: 'administrator' },
])('rejects malformed input or protected extra fields', async (body) => {
  await request(app.getHttpServer())
    .post('/auth/sign-in')
    .send(body)
    .expect(400);
});

test('does not let health or identity polling prolong a session', async () => {
  const signed = await login().expect(200);
  await me(cookie(signed)).expect(200);
  await request(app.getHttpServer())
    .get('/health')
    .set('Cookie', cookie(signed))
    .expect(200);
  const row = (
    await owner.query('SELECT last_seen_at FROM iam.auth_session WHERE id=$1', [
      signed.body.session.id,
    ])
  ).rows[0];
  expect(row.last_seen_at).toBeNull();
});

test('refreshes eligible activity at most once per minute and never revives a revoked session', async () => {
  const secret = tokens.issue();
  const sessionId = await system(
    async (client) =>
      (
        await client.query(
          "INSERT INTO iam.auth_session(account_id,token_hash,created_at,expires_at) VALUES($1,$2,clock_timestamp()-interval '2 minutes',clock_timestamp()+interval '1 hour') RETURNING id",
          [accountId, secret.hash],
        )
      ).rows[0].id,
  );
  const store = new PostgresAuthenticationStore(
    drizzle(runtime, { schema: databaseSchema }),
  );
  await store.touch(accountId, sessionId, randomUUID());
  const first = (
    await owner.query('SELECT last_seen_at FROM iam.auth_session WHERE id=$1', [
      sessionId,
    ])
  ).rows[0].last_seen_at;
  expect(first).toBeInstanceOf(Date);
  await store.touch(accountId, sessionId, randomUUID());
  expect(
    (
      await owner.query(
        'SELECT last_seen_at FROM iam.auth_session WHERE id=$1',
        [sessionId],
      )
    ).rows[0].last_seen_at,
  ).toEqual(first);
  await system((client) =>
    client.query(
      "UPDATE iam.auth_session SET revoked_at=clock_timestamp(),revocation_reason='test' WHERE id=$1",
      [sessionId],
    ),
  );
  await store.touch(accountId, sessionId, randomUUID());
  expect(await store.authenticate(secret.hash)).toBeNull();
});

test('restores no partial session or login change when mandatory audit insertion fails', async () => {
  await owner.query(`CREATE FUNCTION audit.reject_auth_success() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
    IF NEW.event_type='sign_in_succeeded' THEN RAISE EXCEPTION 'Simulated audit failure'; END IF; RETURN NEW; END $$;
    CREATE TRIGGER reject_auth_success BEFORE INSERT ON audit.security_event FOR EACH ROW EXECUTE FUNCTION audit.reject_auth_success()`);
  try {
    const response = await login().expect(503);
    expect(response.headers['set-cookie']).toBeUndefined();
    expect(
      (
        await owner.query(
          'SELECT count(*)::integer AS n FROM iam.auth_session WHERE account_id=$1',
          [accountId],
        )
      ).rows[0].n,
    ).toBe(0);
    expect(
      (
        await owner.query('SELECT last_login_at FROM iam.account WHERE id=$1', [
          accountId,
        ])
      ).rows[0].last_login_at,
    ).toBeNull();
    expect(JSON.stringify(response.body)).not.toContain('Simulated');
  } finally {
    await owner.query(
      'DROP TRIGGER reject_auth_success ON audit.security_event',
    );
    await owner.query('DROP FUNCTION audit.reject_auth_success()');
  }
});

test('the runtime cannot forge a system context or insert security events directly', async () => {
  await expect(
    runtime.query("SELECT audit.set_system_context('forged',$1)", [
      randomUUID(),
    ]),
  ).rejects.toMatchObject({ code: '42501' });
  await expect(
    runtime.query(
      "INSERT INTO audit.security_event(request_id,event_type,subject_hash) VALUES($1,'sign_in_failed',$2)",
      [randomUUID(), Buffer.alloc(32)],
    ),
  ).rejects.toMatchObject({ code: '42501' });
});

test('uses the __Host cookie with Secure in production without an in-memory session store', async () => {
  vi.stubEnv('NODE_ENV', 'production');
  let production;
  try {
    production = await createApp();
    const response = await login(production).expect(200);
    expect(response.headers['set-cookie'][0]).toMatch(
      /^__Host-gabinete_session=/,
    );
    expect(response.headers['set-cookie'][0]).toContain('; Secure');
  } finally {
    await production?.close();
    vi.unstubAllEnvs();
  }
});
