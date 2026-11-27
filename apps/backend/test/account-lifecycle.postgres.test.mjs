import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, expect, test } from 'vitest';
import {
  createIdentityFixture,
  password,
  origin,
} from './helpers/identity-fixture.mjs';
let fixture, app, adminCookie, directorCookie, directorId;
const cookie = (response) => response.headers['set-cookie'][0].split(';')[0];
function signIn(email, value = password, instance = app) {
  return request(instance.getHttpServer())
    .post('/auth/sign-in')
    .set('Origin', origin)
    .send({ email, password: value });
}
function call(method, path, body, credential = directorCookie, instance = app) {
  const req = request(instance.getHttpServer())
    [method](path)
    .set('Origin', origin);
  if (credential) req.set('Cookie', credential);
  return req.send(body);
}
async function invite(roleCodes = ['psychologist']) {
  return (
    await call('post', '/accounts/operational-invitations', {
      givenNames: 'Operational',
      familyNames: 'User',
      email: `person-${randomUUID()}@example.test`,
      roleCodes,
    }).expect(201)
  ).body;
}
async function activate(invitation, value = password, instance = app) {
  return call(
    'post',
    '/auth/activations',
    { token: invitation.activationToken, password: value },
    null,
    instance,
  ).expect(204);
}
async function activeAccount(roles) {
  const invitation = await invite(roles);
  await activate(invitation);
  return invitation;
}
beforeAll(async () => {
  fixture = await createIdentityFixture();
  app = await fixture.createApp();
});
afterAll(async () => {
  await fixture?.close();
});
beforeEach(async () => {
  adminCookie = cookie(await signIn('administrator@example.test').expect(200));
  const candidate = (
    await call(
      'post',
      '/accounts/director-invitations',
      {
        givenNames: 'Current',
        familyNames: 'Director',
        email: `director-${randomUUID()}@example.test`,
      },
      adminCookie,
    ).expect(201)
  ).body;
  await activate(candidate);
  directorId = candidate.account.accountId;
  await call(
    'post',
    `/accounts/${directorId}/director-assignment`,
    {},
    adminCookie,
  ).expect(204);
  directorCookie = cookie(await signIn(candidate.account.email).expect(200));
});
test('invites a psychologist with hashed one-use activation and attributes the grant to the director session', async () => {
  const invitation = await invite();
  expect(invitation.account.status).toBe('invited');
  expect(invitation.account.roles).toEqual(['psychologist']);
  expect(invitation.delivery).toBe('manual');
  await signIn(invitation.account.email).expect(401);
  const saved = (
    await fixture.owner.query(
      'SELECT token_hash FROM iam.account_action_token WHERE account_id=$1',
      [invitation.account.accountId],
    )
  ).rows[0];
  expect(saved.token_hash).toHaveLength(32);
  expect(saved.token_hash.toString()).not.toBe(invitation.activationToken);
  const event = (
    await fixture.owner.query(
      "SELECT actor_account_id,auth_session_id,request_id FROM audit.identity_event WHERE target_account_id=$1 AND action='operational_invited'",
      [invitation.account.accountId],
    )
  ).rows[0];
  expect(event.actor_account_id).toBe(directorId);
  expect(event.auth_session_id).toBeTruthy();
  expect(event.request_id).toBeTruthy();
  await activate(invitation);
  const signed = await signIn(invitation.account.email).expect(200);
  expect(signed.body.identity.roles).toEqual(['psychologist']);
  await call('get', '/accounts', undefined, cookie(signed)).expect(403);
});
test.each(['assistant', 'degree_student'])(
  'activates the predefined %s role without administrative rights',
  async (role) => {
    const invitation = await activeAccount([role]);
    const signed = await signIn(invitation.account.email).expect(200);
    expect(signed.body.identity.roles).toEqual([role]);
    expect(signed.body.identity.permissions).toEqual([]);
    await call(
      'post',
      '/accounts/operational-invitations',
      {
        givenNames: 'Bad',
        familyNames: 'Grant',
        email: 'bad@example.test',
        roleCodes: ['psychologist'],
      },
      cookie(signed),
    ).expect(403);
  },
);
test.each([['administrator'], ['director'], [], ['assistant', 'assistant']])(
  'rejects invalid or escalating roles %j without partial writes',
  async (...roleCodes) => {
    const count = (
      await fixture.owner.query('SELECT count(*) FROM iam.account')
    ).rows[0].count;
    await call('post', '/accounts/operational-invitations', {
      givenNames: 'Bad',
      familyNames: 'Grant',
      email: `bad-${randomUUID()}@example.test`,
      roleCodes,
    }).expect(400);
    expect(
      (await fixture.owner.query('SELECT count(*) FROM iam.account')).rows[0]
        .count,
    ).toBe(count);
  },
);
test('denies admin operational invitations and client-supplied authorship, status or password', async () => {
  const input = {
    givenNames: 'Test',
    familyNames: 'User',
    email: 'forbidden@example.test',
    roleCodes: ['psychologist'],
  };
  await call(
    'post',
    '/accounts/operational-invitations',
    input,
    adminCookie,
  ).expect(403);
  await call('post', '/accounts/operational-invitations', {
    ...input,
    accountId: randomUUID(),
    sessionId: randomUUID(),
    password: 'shared password',
    status: 'active',
  }).expect(400);
  await call('post', '/accounts/operational-invitations', input, null).expect(
    401,
  );
});
test('rolls back person, roles and action on duplicate normalized email', async () => {
  const invited = await invite();
  const count = (await fixture.owner.query('SELECT count(*) FROM core.person'))
    .rows[0].count;
  await call('post', '/accounts/operational-invitations', {
    givenNames: 'Duplicate',
    familyNames: 'User',
    email: invited.account.email.toUpperCase(),
    roleCodes: ['assistant'],
  }).expect(409);
  expect(
    (await fixture.owner.query('SELECT count(*) FROM core.person')).rows[0]
      .count,
  ).toBe(count);
});
test('edits operational names/contact while preserving email and forbidding protected accounts', async () => {
  const invited = await activeAccount();
  const input = {
    givenNames: 'Corrected',
    familyNames: 'User',
    contactPhone: '+591 70000000',
  };
  await call(
    'patch',
    `/accounts/${invited.account.accountId}/profile`,
    input,
  ).expect(204);
  const row = (
    await fixture.owner.query(
      'SELECT a.email,p.given_names,p.contact_phone FROM iam.account a JOIN core.person p ON p.id=a.person_id WHERE a.id=$1',
      [invited.account.accountId],
    )
  ).rows[0];
  expect(row).toEqual({
    email: invited.account.email,
    given_names: 'Corrected',
    contact_phone: '+591 70000000',
  });
  await call('patch', `/accounts/${directorId}/profile`, input).expect(403);
  await call(
    'patch',
    `/accounts/${fixture.administrator.accountId}/profile`,
    input,
  ).expect(403);
  await call('patch', `/accounts/${invited.account.accountId}/profile`, {
    ...input,
    email: 'changed@example.test',
  }).expect(400);
});
test('atomically changes multiple roles, revokes both sessions and retains the former grant', async () => {
  const account = await activeAccount();
  const one = cookie(await signIn(account.account.email).expect(200));
  const two = cookie(await signIn(account.account.email).expect(200));
  await call('put', `/accounts/${account.account.accountId}/roles`, {
    roleCodes: ['assistant', 'degree_student'],
  }).expect(204);
  await call('get', '/auth/me', undefined, one).expect(401);
  await call('get', '/auth/me', undefined, two).expect(401);
  const signed = await signIn(account.account.email).expect(200);
  expect(signed.body.identity.roles).toEqual(['assistant', 'degree_student']);
  expect(
    (
      await fixture.owner.query(
        'SELECT count(*) FROM iam.account_role WHERE account_id=$1 AND revoked_at IS NOT NULL',
        [account.account.accountId],
      )
    ).rows[0].count,
  ).toBe('1');
});
test('keeps an account administrable after its final role is revoked and prevents elevation', async () => {
  const account = await activeAccount();
  const id = account.account.accountId;
  await call('put', `/accounts/${id}/roles`, { roleCodes: [] }).expect(204);
  const listed = await call('get', '/accounts?pageSize=100').expect(200);
  expect(listed.body.items.find((item) => item.accountId === id)).toMatchObject(
    { roles: [], managementKind: 'operational' },
  );
  await call('put', `/accounts/${id}/roles`, {
    roleCodes: ['administrator'],
  }).expect(400);
  await call('put', `/accounts/${directorId}/roles`, {
    roleCodes: ['assistant'],
  }).expect(403);
});
test('disables access logically, revokes sessions/links/roles and keeps the person active', async () => {
  const account = await activeAccount();
  const id = account.account.accountId;
  const signed = cookie(await signIn(account.account.email).expect(200));
  const reset = (
    await call('post', `/accounts/${id}/password-reset-invitations`, {}).expect(
      201,
    )
  ).body;
  await call('post', `/accounts/${id}/disable`, {
    reason: 'Practice period completed',
  }).expect(204);
  await call('get', '/auth/me', undefined, signed).expect(401);
  await signIn(account.account.email).expect(401);
  await call(
    'post',
    '/auth/activations',
    { token: reset.activationToken, password },
    null,
  ).expect(400);
  const row = (
    await fixture.owner.query(
      'SELECT a.account_status,p.active FROM iam.account a JOIN core.person p ON p.id=a.person_id WHERE a.id=$1',
      [id],
    )
  ).rows[0];
  expect(row).toEqual({ account_status: 'disabled', active: true });
  expect(
    (
      await fixture.owner.query(
        "SELECT reason FROM audit.identity_event WHERE action='account_disabled' AND target_account_id=$1",
        [id],
      )
    ).rows[0].reason,
  ).toBe('Practice period completed');
});
test('reinvites with newly selected roles and never resurrects old links, passwords or sessions', async () => {
  const account = await activeAccount();
  const id = account.account.accountId;
  await call('post', `/accounts/${id}/disable`, {
    reason: 'Practice period completed',
  }).expect(204);
  const next = (
    await call('post', `/accounts/${id}/reinvitations`, {
      roleCodes: ['assistant'],
    }).expect(201)
  ).body;
  await signIn(account.account.email).expect(401);
  await call(
    'post',
    '/auth/activations',
    { token: account.activationToken, password },
    null,
  ).expect(400);
  const newPassword = 'A new and private testing passphrase';
  await activate(next, newPassword);
  await signIn(account.account.email).expect(401);
  expect(
    (await signIn(account.account.email, newPassword).expect(200)).body.identity
      .roles,
  ).toEqual(['assistant']);
});
test('rotates a pending invitation and rejects its previous token', async () => {
  const account = await invite();
  const next = (
    await call('post', `/accounts/${account.account.accountId}/reinvitations`, {
      roleCodes: ['degree_student'],
    }).expect(201)
  ).body;
  await call(
    'post',
    '/auth/activations',
    { token: account.activationToken, password },
    null,
  ).expect(400);
  await activate(next);
});
test('serializes activation against disable and always leaves the account disabled', async () => {
  const account = await invite();
  const id = account.account.accountId;
  const second = await fixture.createApp();
  const responses = await Promise.all([
    call('post', `/accounts/${id}/disable`, {
      reason: 'Invitation cancelled by director',
    }),
    call(
      'post',
      '/auth/activations',
      { token: account.activationToken, password },
      null,
      second,
    ),
  ]);
  expect(responses[0].status).toBe(204);
  expect([204, 400]).toContain(responses[1].status);
  await signIn(account.account.email).expect(401);
  expect(
    (
      await fixture.owner.query(
        'SELECT account_status FROM iam.account WHERE id=$1',
        [id],
      )
    ).rows[0].account_status,
  ).toBe('disabled');
});
test('expires a recovery link without changing the existing password', async () => {
  const account = await activeAccount();
  const id = account.account.accountId;
  const reset = (
    await call('post', `/accounts/${id}/password-reset-invitations`, {}).expect(
      201,
    )
  ).body;
  await fixture.owner.query(
    'ALTER TABLE iam.account_action_token DISABLE TRIGGER account_action_guard; ALTER TABLE iam.account_action_token DISABLE TRIGGER audit_row_change',
  );
  try {
    await fixture.owner.query(
      "UPDATE iam.account_action_token SET created_at=clock_timestamp()-interval '2 hours',expires_at=clock_timestamp()-interval '1 hour' WHERE account_id=$1 AND purpose='password_reset'",
      [id],
    );
  } finally {
    await fixture.owner.query(
      'ALTER TABLE iam.account_action_token ENABLE TRIGGER account_action_guard; ALTER TABLE iam.account_action_token ENABLE TRIGGER audit_row_change',
    );
  }
  await call(
    'post',
    '/auth/activations',
    {
      token: reset.activationToken,
      password: 'A rejected replacement password',
    },
    null,
  ).expect(400);
  await signIn(account.account.email).expect(200);
});
test('resets a password once and only revokes sessions when the new password commits', async () => {
  const account = await activeAccount();
  const id = account.account.accountId;
  const signed = cookie(await signIn(account.account.email).expect(200));
  const reset = (
    await call('post', `/accounts/${id}/password-reset-invitations`, {}).expect(
      201,
    )
  ).body;
  await call('get', '/auth/me', undefined, signed).expect(200);
  const next = 'The recipient chooses this passphrase';
  await activate(reset, next);
  await call('get', '/auth/me', undefined, signed).expect(401);
  await signIn(account.account.email).expect(401);
  await signIn(account.account.email, next).expect(200);
  await call(
    'post',
    '/auth/activations',
    { token: reset.activationToken, password },
    null,
  ).expect(400);
});
test('serializes recovery consumption across application instances', async () => {
  const account = await activeAccount();
  const reset = (
    await call(
      'post',
      `/accounts/${account.account.accountId}/password-reset-invitations`,
      {},
    ).expect(201)
  ).body;
  const second = await fixture.createApp();
  const responses = await Promise.all(
    [app, second].map((instance) =>
      call(
        'post',
        '/auth/activations',
        { token: reset.activationToken, password },
        null,
        instance,
      ),
    ),
  );
  expect(responses.map((res) => res.status).sort()).toEqual([204, 400]);
});
test('restricts sessions to the authenticated owner and supports individual revocation', async () => {
  const account = await activeAccount();
  const first = await signIn(account.account.email).expect(200);
  const second = await signIn(account.account.email).expect(200);
  const own = await call(
    'get',
    '/auth/sessions',
    undefined,
    cookie(first),
  ).expect(200);
  expect(own.body).toHaveLength(2);
  expect(own.body.find((item) => item.current).id).toBe(first.body.session.id);
  expect(JSON.stringify(own.body)).not.toMatch(/token|password|hash/u);
  await call(
    'post',
    `/auth/sessions/${second.body.session.id}/revocations`,
    {},
    cookie(first),
  ).expect(204);
  await call('get', '/auth/me', undefined, cookie(second)).expect(401);
  const adminSession = (
    await call('get', '/auth/me', undefined, adminCookie).expect(200)
  ).body.session.id;
  await call(
    'post',
    `/auth/sessions/${adminSession}/revocations`,
    {},
    cookie(first),
  ).expect(404);
  await call(
    'post',
    `/auth/sessions/${first.body.session.id}/revocations`,
    {},
    cookie(first),
  ).expect(204);
  await call('get', '/auth/me', undefined, cookie(first)).expect(401);
});
test('requires the current password and revokes every old session after an own password change', async () => {
  const account = await activeAccount();
  const first = await signIn(account.account.email).expect(200);
  const second = await signIn(account.account.email).expect(200);
  const next = 'My new personal testing passphrase';
  await call(
    'post',
    '/auth/password-change',
    { currentPassword: 'wrong', newPassword: next },
    cookie(first),
  ).expect(400);
  await call('get', '/auth/me', undefined, cookie(first)).expect(200);
  await call(
    'post',
    '/auth/password-change',
    { currentPassword: password, newPassword: next },
    cookie(first),
  ).expect(204);
  await call('get', '/auth/me', undefined, cookie(first)).expect(401);
  await call('get', '/auth/me', undefined, cookie(second)).expect(401);
  await signIn(account.account.email, next).expect(200);
});
test('persists failed own-password checks and throttles further attempts', async () => {
  const account = await activeAccount();
  const signed = cookie(await signIn(account.account.email).expect(200));
  for (let attempt = 0; attempt < 5; attempt++)
    await call(
      'post',
      '/auth/password-change',
      { currentPassword: 'wrong', newPassword: password },
      signed,
    ).expect(400);
  const throttled = await call(
    'post',
    '/auth/password-change',
    { currentPassword: password, newPassword: password },
    signed,
  ).expect(429);
  expect(throttled.headers['retry-after']).toBe('900');
});
test('updates own contact without allowing account or role selection', async () => {
  const account = await activeAccount();
  const signed = cookie(await signIn(account.account.email).expect(200));
  await call(
    'put',
    '/auth/contact',
    { contactPhone: '+591 70000000' },
    signed,
  ).expect(204);
  expect(
    (await call('get', '/auth/contact', undefined, signed).expect(200)).body,
  ).toEqual({ contactPhone: '+591 70000000' });
  await call(
    'put',
    '/auth/contact',
    { contactPhone: null, accountId: fixture.administrator.accountId },
    signed,
  ).expect(400);
});
test('protects former directors and supports admin-only suspension/reinvitation without automatically appointing them', async () => {
  const current = (await call('get', '/auth/me').expect(200)).body.identity;
  await call(
    'post',
    `/accounts/${directorId}/disable`,
    { reason: 'Administrative access incident' },
    adminCookie,
  ).expect(204);
  await call('get', '/auth/me').expect(401);
  const next = (
    await call(
      'post',
      `/accounts/${directorId}/reinvitations`,
      { roleCodes: [] },
      adminCookie,
    ).expect(201)
  ).body;
  await activate(next);
  expect((await signIn(current.email).expect(200)).body.identity.roles).toEqual(
    [],
  );
  await call(
    'post',
    `/accounts/${fixture.administrator.accountId}/disable`,
    { reason: 'Attempted administrator removal' },
    adminCookie,
  ).expect(403);
});
test('returns scoped identity audit metadata and prevents operational access to the audit', async () => {
  const account = await activeAccount();
  const signed = cookie(await signIn(account.account.email).expect(200));
  const audit = (await call('get', '/identity-audit?pageSize=100').expect(200))
    .body;
  expect(
    audit.items.some(
      (entry) =>
        entry.action === 'operational_invited' &&
        entry.targetAccountId === account.account.accountId,
    ),
  ).toBe(true);
  expect(
    audit.items.some(
      (entry) => entry.targetAccountId === fixture.administrator.accountId,
    ),
  ).toBe(false);
  expect(JSON.stringify(audit)).not.toContain(account.activationToken);
  const storedHash = (
    await fixture.owner.query(
      'SELECT token_hash FROM iam.account_action_token WHERE account_id=$1',
      [account.account.accountId],
    )
  ).rows[0].token_hash;
  expect(JSON.stringify(audit)).not.toContain(storedHash.toString('hex'));
  expect(
    audit.items.every(
      (entry) =>
        Object.keys(entry).sort().join(',') ===
        [
          'id',
          'occurredAt',
          'action',
          'targetAccountId',
          'actorAccountId',
          'sessionId',
          'requestId',
          'changedFields',
          'reason',
        ]
          .sort()
          .join(','),
    ),
  ).toBe(true);
  await call('get', '/identity-audit', undefined, signed).expect(403);
  await call('get', '/identity-audit?sessionId=' + randomUUID()).expect(400);
});
test('keeps semantic audit immutable and denies attribution without a verified transaction context', async () => {
  const account = await invite();
  await expect(
    fixture.runtime.query(
      'INSERT INTO audit.identity_event(action,target_account_id,actor_account_id,auth_session_id,request_id) VALUES($1,$2,$3,$4,$5)',
      [
        'contact_updated',
        account.account.accountId,
        directorId,
        randomUUID(),
        randomUUID(),
      ],
    ),
  ).rejects.toMatchObject({ code: '42501' });
  await expect(
    fixture.runtime.query('SELECT audit.record_identity_event($1,$2,NULL)', [
      'contact_updated',
      account.account.accountId,
    ]),
  ).rejects.toMatchObject({ code: '22023' });
  await expect(
    fixture.owner.query(
      "UPDATE audit.identity_event SET action='contact_updated' WHERE target_account_id=$1",
      [account.account.accountId],
    ),
  ).rejects.toThrow();
  await expect(
    fixture.owner.query(
      'DELETE FROM audit.identity_event WHERE target_account_id=$1',
      [account.account.accountId],
    ),
  ).rejects.toThrow();
});
test('rolls back all account changes when semantic auditing fails', async () => {
  const account = await activeAccount();
  const id = account.account.accountId;
  const signed = cookie(await signIn(account.account.email).expect(200));
  await fixture.owner
    .query(`CREATE FUNCTION audit.test_lifecycle_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action='account_disabled' THEN RAISE EXCEPTION 'fixture failure'; END IF; RETURN NEW; END $$;
    CREATE TRIGGER test_lifecycle_failure BEFORE INSERT ON audit.identity_event FOR EACH ROW EXECUTE FUNCTION audit.test_lifecycle_failure()`);
  try {
    await call('post', `/accounts/${id}/disable`, {
      reason: 'Attempt with injected failure',
    }).expect(503);
  } finally {
    await fixture.owner.query(
      'DROP TRIGGER test_lifecycle_failure ON audit.identity_event; DROP FUNCTION audit.test_lifecycle_failure()',
    );
  }
  await call('get', '/auth/me', undefined, signed).expect(200);
  expect(
    (
      await fixture.owner.query(
        'SELECT account_status FROM iam.account WHERE id=$1',
        [id],
      )
    ).rows[0].account_status,
  ).toBe('active');
});
