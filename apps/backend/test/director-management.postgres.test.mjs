import { randomUUID, randomBytes, createHash } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, expect, test } from 'vitest';
import {
  createIdentityFixture,
  password,
  origin,
} from './helpers/identity-fixture.mjs';

let fixture, app, administrator, adminCookie, adminSession;
function signIn(email = 'administrator@example.test', instance = app) {
  return request(instance.getHttpServer())
    .post('/auth/sign-in')
    .set('Origin', origin)
    .send({ email, password });
}
function cookie(response) {
  return response.headers['set-cookie'][0].split(';')[0];
}
function post(path, body, credential = adminCookie, instance = app) {
  const call = request(instance.getHttpServer())
    .post(path)
    .set('Origin', origin);
  if (credential) call.set('Cookie', credential);
  return call.send(body);
}
async function invite(address = `candidate-${randomUUID()}@example.test`) {
  return (
    await post('/accounts/director-invitations', {
      givenNames: 'Test',
      familyNames: 'Candidate',
      email: address,
    }).expect(201)
  ).body;
}
async function activatedCandidate() {
  const invited = await invite();
  await post(
    '/auth/activations',
    { token: invited.activationToken, password },
    null,
  ).expect(204);
  return invited;
}
beforeAll(async () => {
  fixture = await createIdentityFixture();
  administrator = fixture.administrator;
  app = await fixture.createApp();
});
beforeEach(async () => {
  const signed = await signIn().expect(200);
  adminCookie = cookie(signed);
  adminSession = signed.body.session.id;
  await fixture.asActor(
    { accountId: administrator.accountId, sessionId: adminSession },
    (client) =>
      client.query(
        "UPDATE iam.account_role ar SET revoked_at=clock_timestamp() FROM iam.role r WHERE r.id=ar.role_id AND r.code='director' AND ar.revoked_at IS NULL",
      ),
  );
});
afterAll(async () => {
  await fixture?.close();
});

test('denies anonymous administration and validates protected fields after authenticating', async () => {
  await request(app.getHttpServer()).get('/accounts').expect(401);
  await post('/accounts/director-invitations', {
    givenNames: 'Test',
    familyNames: 'Candidate',
    email: 'extra@example.test',
    role: 'administrator',
  }).expect(400);
  await request(app.getHttpServer())
    .get('/accounts?pageSize=1000')
    .set('Cookie', adminCookie)
    .expect(400);
});
test('creates a pending candidate with no business role and shows a credential exactly once', async () => {
  const invited = await invite();
  expect(invited.account.status).toBe('invited');
  expect(invited.account.roles).toEqual([]);
  expect(invited.activationToken).toMatch(/^[A-Za-z0-9_-]{43}$/u);
  const saved = (
    await fixture.owner.query(
      'SELECT token_hash FROM iam.account_action_token WHERE account_id=$1',
      [invited.account.accountId],
    )
  ).rows[0];
  expect(saved.token_hash).toHaveLength(32);
  const listed = await request(app.getHttpServer())
    .get('/accounts?pageSize=100')
    .set('Cookie', adminCookie)
    .expect(200);
  expect(
    listed.body.items.some(
      (item) => item.accountId === invited.account.accountId,
    ),
  ).toBe(true);
  expect(JSON.stringify(listed.body)).not.toContain(invited.activationToken);
  expect(JSON.stringify(listed.body)).not.toMatch(
    /password|token_hash|roleHistory|personActive/u,
  );
  await signIn(invited.account.email).expect(401);
});
test('rolls back person creation if a normalized email is already reserved', async () => {
  const invited = await invite();
  const before = (await fixture.owner.query('SELECT count(*) FROM core.person'))
    .rows[0].count;
  await post('/accounts/director-invitations', {
    givenNames: 'Duplicate',
    familyNames: 'Person',
    email: invited.account.email.toUpperCase(),
  }).expect(409);
  expect(
    (await fixture.owner.query('SELECT count(*) FROM core.person')).rows[0]
      .count,
  ).toBe(before);
});
test('activates once without issuing a browser session and attributes password changes to a closed action session', async () => {
  const invited = await invite();
  const activated = await post(
    '/auth/activations',
    { token: invited.activationToken, password },
    null,
  ).expect(204);
  expect(activated.headers['set-cookie']).toBeUndefined();
  await post(
    '/auth/activations',
    { token: invited.activationToken, password },
    null,
  ).expect(400);
  const signed = await signIn(invited.account.email).expect(200);
  expect(signed.body.identity.roles).toEqual([]);
  const audit = (
    await fixture.owner.query(
      "SELECT ce.actor_account_id,s.session_kind,s.revoked_at FROM audit.change_event ce JOIN iam.auth_session s ON s.id=ce.auth_session_id WHERE ce.table_name='account' AND ce.row_id=$1 AND ce.operation='UPDATE' ORDER BY ce.occurred_at LIMIT 1",
      [invited.account.accountId],
    )
  ).rows[0];
  expect(audit.actor_account_id).toBe(invited.account.accountId);
  expect(audit.session_kind).toBe('account_activation');
  expect(audit.revoked_at).not.toBeNull();
  await request(app.getHttpServer())
    .get('/accounts')
    .set('Cookie', cookie(signed))
    .expect(403);
});
test('rejects malformed, expired and revoked action links and preserves the pending account', async () => {
  await post('/auth/activations', { token: 'invalid', password }, null).expect(
    400,
  );
  await post(
    '/auth/activations',
    { token: 'x'.repeat(43), password: 'short' },
    null,
  ).expect(400);
  const invited = await invite();
  await fixture.asActor(
    { accountId: administrator.accountId, sessionId: adminSession },
    (client) =>
      client.query(
        'UPDATE iam.account_action_token SET revoked_at=clock_timestamp() WHERE account_id=$1',
        [invited.account.accountId],
      ),
  );
  await post(
    '/auth/activations',
    { token: invited.activationToken, password },
    null,
  ).expect(400);
  expect(
    (
      await fixture.owner.query(
        'SELECT account_status FROM iam.account WHERE id=$1',
        [invited.account.accountId],
      )
    ).rows[0].account_status,
  ).toBe('invited');
});
test('consumes a link only once across two application instances', async () => {
  const invited = await invite();
  const second = await fixture.createApp();
  const outcomes = await Promise.all([
    post(
      '/auth/activations',
      { token: invited.activationToken, password },
      null,
    ),
    post(
      '/auth/activations',
      { token: invited.activationToken, password },
      null,
      second,
    ),
  ]);
  expect(outcomes.map((result) => result.status).sort((a, b) => a - b)).toEqual(
    [204, 400],
  );
});
test('requires explicit designation and revokes the candidate browser session when its role changes', async () => {
  const invited = await activatedCandidate();
  const signed = await signIn(invited.account.email).expect(200);
  await post(
    `/accounts/${invited.account.accountId}/director-assignment`,
    {},
  ).expect(204);
  await request(app.getHttpServer())
    .get('/auth/me')
    .set('Cookie', cookie(signed))
    .expect(401);
  const director = await signIn(invited.account.email).expect(200);
  expect(director.body.identity.roles).toEqual(['director']);
  expect(director.body.identity.permissions).toHaveLength(10);
  const scoped = await request(app.getHttpServer())
    .get('/accounts')
    .set('Cookie', cookie(director))
    .expect(200);
  expect(scoped.body.items).toEqual([]);
  await post(
    '/accounts/director-invitations',
    {
      givenNames: 'Forbidden',
      familyNames: 'Candidate',
      email: 'denied@example.test',
    },
    cookie(director),
  ).expect(403);
});
test('rejects an unactivated candidate, self-assignment and missing accounts', async () => {
  const pending = await invite();
  await post(
    `/accounts/${pending.account.accountId}/director-assignment`,
    {},
  ).expect(409);
  await post(
    `/accounts/${administrator.accountId}/director-assignment`,
    {},
  ).expect(409);
  await post(`/accounts/${randomUUID()}/director-assignment`, {}).expect(404);
  await post('/accounts/not-a-uuid/director-assignment', {}).expect(400);
});
test('serializes concurrent director designations and preserves the previous grant as revoked history', async () => {
  const first = await activatedCandidate();
  const second = await activatedCandidate();
  const outcomes = await Promise.all([
    post(`/accounts/${first.account.accountId}/director-assignment`, {}),
    post(`/accounts/${second.account.accountId}/director-assignment`, {}),
  ]);
  expect(outcomes.map((result) => result.status)).toEqual([204, 204]);
  const grants = await fixture.owner.query(
    "SELECT revoked_at FROM iam.account_role ar JOIN iam.role r ON r.id=ar.role_id WHERE r.code='director' AND ar.account_id=ANY($1::uuid[])",
    [[first.account.accountId, second.account.accountId]],
  );
  expect(grants.rows.filter((row) => row.revoked_at === null)).toHaveLength(1);
  expect(grants.rows.filter((row) => row.revoked_at !== null)).toHaveLength(1);
});
test('requires fresh password authentication before sensitive account operations', async () => {
  const client = await fixture.owner.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      'ALTER TABLE iam.auth_session DISABLE TRIGGER auth_session_identity_guard',
    );
    await client.query('SELECT audit.set_request_context($1,$2,$3)', [
      administrator.accountId,
      adminSession,
      randomUUID(),
    ]);
    await client.query(
      "UPDATE iam.auth_session SET created_at=clock_timestamp()-interval '11 minutes' WHERE id=$1",
      [adminSession],
    );
    await client.query(
      'ALTER TABLE iam.auth_session ENABLE TRIGGER auth_session_identity_guard',
    );
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
  const denied = await post('/accounts/director-invitations', {
    givenNames: 'Test',
    familyNames: 'Fresh',
    email: 'fresh@example.test',
  }).expect(403);
  expect(denied.body.code).toBe('reauthentication_required');
});
test('returns only the predefined role catalog and rejects cross-site activation', async () => {
  const roles = await request(app.getHttpServer())
    .get('/roles')
    .set('Cookie', adminCookie)
    .expect(200);
  expect(roles.body).toHaveLength(5);
  const invited = await invite();
  await request(app.getHttpServer())
    .post('/auth/activations')
    .set('Origin', 'https://foreign.example')
    .set('Sec-Fetch-Site', 'cross-site')
    .send({ token: invited.activationToken, password })
    .expect(403);
});

test('rejects expired tokens without changing the pending account', async () => {
  const invited = await invite();
  const raw = randomBytes(32).toString('base64url');
  await fixture.asActor(
    { accountId: administrator.accountId, sessionId: adminSession },
    async (client) => {
      await client.query(
        'UPDATE iam.account_action_token SET revoked_at=clock_timestamp() WHERE account_id=$1',
        [invited.account.accountId],
      );
      await client.query(
        "INSERT INTO iam.account_action_token(account_id,purpose,token_hash,created_at,expires_at) VALUES($1,'director_activation',$2,clock_timestamp()-interval '2 days',clock_timestamp()-interval '1 day')",
        [invited.account.accountId, createHash('sha256').update(raw).digest()],
      );
    },
  );
  await post('/auth/activations', { token: raw, password }, null).expect(400);
});

test('rolls back password activation and its action session when mandatory audit work fails', async () => {
  const invited = await invite();
  await fixture.owner.query(
    "CREATE FUNCTION iam.reject_test_activation() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Simulated activation failure'; END $$; CREATE TRIGGER reject_test_activation BEFORE UPDATE ON iam.account_action_token FOR EACH ROW WHEN(NEW.consumed_at IS NOT NULL) EXECUTE FUNCTION iam.reject_test_activation()",
  );
  try {
    const response = await post(
      '/auth/activations',
      { token: invited.activationToken, password },
      null,
    ).expect(503);
    expect(JSON.stringify(response.body)).not.toContain('Simulated');
    const row = (
      await fixture.owner.query(
        'SELECT account_status,password_hash FROM iam.account WHERE id=$1',
        [invited.account.accountId],
      )
    ).rows[0];
    expect(row).toEqual({ account_status: 'invited', password_hash: null });
    expect(
      (
        await fixture.owner.query(
          'SELECT count(*)::int AS count FROM iam.auth_session WHERE account_id=$1',
          [invited.account.accountId],
        )
      ).rows[0].count,
    ).toBe(0);
  } finally {
    await fixture.owner.query(
      'DROP TRIGGER reject_test_activation ON iam.account_action_token; DROP FUNCTION iam.reject_test_activation()',
    );
  }
  await post(
    '/auth/activations',
    { token: invited.activationToken, password },
    null,
  ).expect(204);
});

test('rolls back replacement if the new director grant cannot be saved', async () => {
  const first = await activatedCandidate();
  await post(
    `/accounts/${first.account.accountId}/director-assignment`,
    {},
  ).expect(204);
  const current = await signIn(first.account.email).expect(200);
  const replacement = await activatedCandidate();
  await fixture.owner.query(
    `CREATE FUNCTION iam.reject_test_director() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.account_id='${replacement.account.accountId}'::uuid THEN RAISE EXCEPTION 'Simulated director failure'; END IF; RETURN NEW; END $$; CREATE TRIGGER reject_test_director BEFORE INSERT ON iam.account_role FOR EACH ROW EXECUTE FUNCTION iam.reject_test_director()`,
  );
  try {
    await post(
      `/accounts/${replacement.account.accountId}/director-assignment`,
      {},
    ).expect(503);
    const me = await request(app.getHttpServer())
      .get('/auth/me')
      .set('Cookie', cookie(current))
      .expect(200);
    expect(me.body.identity.roles).toEqual(['director']);
  } finally {
    await fixture.owner.query(
      'DROP TRIGGER reject_test_director ON iam.account_role; DROP FUNCTION iam.reject_test_director()',
    );
  }
});

test('the database rejects a second live director grant even outside the designation endpoint', async () => {
  const first = await activatedCandidate();
  await post(
    `/accounts/${first.account.accountId}/director-assignment`,
    {},
  ).expect(204);
  const second = await activatedCandidate();
  await expect(
    fixture.asActor(
      { accountId: administrator.accountId, sessionId: adminSession },
      (client) =>
        client.query(
          "INSERT INTO iam.account_role(account_id,role_id) SELECT $1,id FROM iam.role WHERE code='director'",
          [second.account.accountId],
        ),
    ),
  ).rejects.toMatchObject({
    code: '23505',
    constraint: 'single_active_director',
  });
});

test('the director can still see operational accounts whose last role was revoked and cannot see protected accounts', async () => {
  const invited = await activatedCandidate();
  await post(
    `/accounts/${invited.account.accountId}/director-assignment`,
    {},
  ).expect(204);
  const operationalId = await fixture.asActor(
    { accountId: administrator.accountId, sessionId: adminSession },
    async (client) => {
      const person = (
        await client.query(
          "INSERT INTO core.person(given_names,family_names) VALUES('Operational','Account') RETURNING id",
        )
      ).rows[0].id;
      const id = (
        await client.query(
          "INSERT INTO iam.account(person_id,email,password_hash,account_status) VALUES($1,$2,$3,'active') RETURNING id",
          [
            person,
            `operational-${randomUUID()}@example.test`,
            await fixture.passwords.hash(password),
          ],
        )
      ).rows[0].id;
      await client.query(
        "INSERT INTO iam.account_role(account_id,role_id) SELECT $1,id FROM iam.role WHERE code='psychologist'",
        [id],
      );
      await client.query(
        'UPDATE iam.account_role SET revoked_at=clock_timestamp() WHERE account_id=$1',
        [id],
      );
      return id;
    },
  );
  const director = await signIn(invited.account.email).expect(200);
  const result = await request(app.getHttpServer())
    .get('/accounts')
    .set('Cookie', cookie(director))
    .expect(200);
  expect(result.body.items.map((item) => item.accountId)).toEqual([
    operationalId,
  ]);
  expect(result.body.items[0].canAssignDirector).toBe(false);
});
