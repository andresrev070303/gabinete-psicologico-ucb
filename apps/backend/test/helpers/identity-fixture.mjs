import { randomBytes, randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { Client, Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Test } from '@nestjs/testing';
import { PasswordHasher } from '@nestjs/authentication';
import { AppModule } from '../../src/app.module.js';
import { DatabaseService } from '../../src/infrastructure/database/database.service.js';
import { databaseSchema } from '../../src/infrastructure/database/database.schema.js';
import { BootstrapAdministrator } from '../../src/modules/identity/application/bootstrap-administrator.js';
import { PostgresIdentityBootstrapStore } from '../../src/modules/identity/infrastructure/postgres-identity-bootstrap.store.js';
import { configureApplication } from '../../src/configure-application.js';

export const password = 'A long testing passphrase';
export const origin = 'http://localhost:5173';
export async function createIdentityFixture({ practicum = false } = {}) {
  const url = new URL(
    process.env.TEST_DATABASE_URL ?? 'http://missing-test-database',
  );
  if (
    url.protocol !== 'postgresql:' ||
    !['127.0.0.1', 'localhost'].includes(url.hostname) ||
    url.pathname !== '/postgres'
  )
    throw new Error('Use private local PostgreSQL for integration tests.');
  const control = new Client({ connectionString: url.toString() });
  const databaseName = `director_test_${randomUUID().replaceAll('-', '')}`;
  const role = `director_runtime_${randomUUID().replaceAll('-', '')}`;
  const rolePassword = randomBytes(32).toString('hex');
  const passwords = new PasswordHasher({ logN: 10 });
  let owner,
    runtime,
    databaseCreated = false,
    roleCreated = false;
  const apps = [];
  async function close() {
    for (const app of apps) await app.close();
    await runtime?.end();
    await owner?.end();
    try {
      if (databaseCreated)
        await control.query(`DROP DATABASE "${databaseName}"`);
      if (roleCreated) await control.query(`DROP ROLE "${role}"`);
    } finally {
      await control.end();
    }
  }
  try {
    await control.connect();
    await control.query(`CREATE DATABASE "${databaseName}"`);
    databaseCreated = true;
    url.pathname = `/${databaseName}`;
    owner = new Pool({ connectionString: url.toString(), max: 4 });
    await migrate(drizzle(owner), {
      migrationsFolder: fileURLToPath(
        new URL('../../drizzle/', import.meta.url),
      ),
    });
    const administrator = await new BootstrapAdministrator(
      new PostgresIdentityBootstrapStore(drizzle(owner)),
      passwords,
    ).execute({
      givenNames: 'Test',
      familyNames: 'Admin',
      email: 'administrator@example.test',
      password,
    });
    if (practicum)
      await owner.query('SELECT practicum.install_access_catalog()');
    await control.query(
      `CREATE ROLE "${role}" LOGIN PASSWORD '${rolePassword}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS`,
    );
    roleCreated = true;
    await owner.query(`GRANT USAGE ON SCHEMA core,iam,audit TO "${role}"; GRANT SELECT ON ALL TABLES IN SCHEMA core,iam,audit TO "${role}";
      GRANT INSERT,UPDATE ON core.person,iam.account,iam.account_role,iam.auth_session,iam.account_action_token TO "${role}";
      GRANT EXECUTE ON FUNCTION audit.set_request_context(uuid,uuid,uuid),audit.record_auth_event(uuid,text,bytea,uuid,uuid),audit.record_identity_event(text,uuid,text) TO "${role}"`);
    if (practicum)
      await owner.query(`GRANT USAGE ON SCHEMA practicum,reporting TO "${role}";
      GRANT SELECT ON ALL TABLES IN SCHEMA practicum TO "${role}";
      GRANT INSERT ON practicum.academic_term,practicum.placement,practicum.work_task,practicum.activity_log TO "${role}";
      GRANT UPDATE ON practicum.placement,practicum.work_task,practicum.activity_log TO "${role}"`);
    url.username = role;
    url.password = rolePassword;
    runtime = new Pool({ connectionString: url.toString(), max: 5 });
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
      const app = module.createNestApplication();
      configureApplication(app, [origin]);
      await app.init();
      apps.push(app);
      return app;
    }
    async function asActor(actor, work) {
      const client = await owner.connect();
      try {
        await client.query('BEGIN');
        await client.query('SELECT audit.set_request_context($1,$2,$3)', [
          actor.accountId,
          actor.sessionId,
          randomUUID(),
        ]);
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
    return {
      owner,
      runtime,
      administrator,
      passwords,
      createApp,
      asActor,
      close,
    };
  } catch (error) {
    await close();
    throw error;
  }
}
