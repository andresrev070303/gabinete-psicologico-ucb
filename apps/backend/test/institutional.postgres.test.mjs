import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { beforeAll, afterAll, expect, test } from 'vitest';
import {
  createIdentityFixture,
  origin,
  password,
} from './helpers/identity-fixture.mjs';
let fixture,
  app,
  adminCookie,
  directorCookie,
  directorId,
  member,
  outsider,
  institution;
const cookie = (response) => response.headers['set-cookie'][0].split(';')[0];
function call(method, path, body, credential = directorCookie) {
  const result = request(app.getHttpServer())
    [method](path)
    .set('Origin', origin);
  if (credential) result.set('Cookie', credential);
  return body === undefined ? result : result.send(body);
}
const signIn = (email) =>
  call('post', '/auth/sign-in', { email, password }, null);
async function operational(role = 'assistant') {
  const email = `institutional-${randomUUID()}@example.test`;
  const invitation = (
    await call('post', '/accounts/operational-invitations', {
      givenNames: 'Test',
      familyNames: 'Member',
      email,
      roleCodes: [role],
    }).expect(201)
  ).body;
  await call(
    'post',
    '/auth/activations',
    { token: invitation.activationToken, password },
    null,
  ).expect(204);
  const signed = await signIn(email).expect(200);
  return { id: signed.body.identity.accountId, credential: cookie(signed) };
}
function draft(overrides = {}) {
  return {
    id: randomUUID(),
    kind: 'activity',
    type: 'talk',
    title: 'Community orientation talk',
    description: 'An institutional activity',
    startsAt: '2026-01-02T13:00:00Z',
    endsAt: '2026-01-02T15:00:00Z',
    institutionId: null,
    responsibleAccountId: directorId,
    memberAccountIds: [member.id],
    projectId: null,
    agreementId: null,
    code: null,
    venue: 'UCB',
    ...overrides,
  };
}
const path = (record) => `/institutional/records/${record.kind}/${record.id}`;
async function create(overrides = {}) {
  const input = draft(overrides);
  const response = await call('post', '/institutional/records', input).expect(
    201,
  );
  return { input, details: response.body, record: response.body.record };
}
beforeAll(async () => {
  fixture = await createIdentityFixture({ institutional: true });
  app = await fixture.createApp();
  adminCookie = cookie(await signIn('administrator@example.test').expect(200));
  const email = 'institutional-director@example.test';
  const invitation = (
    await call(
      'post',
      '/accounts/director-invitations',
      { givenNames: 'Carla', familyNames: 'Director', email },
      adminCookie,
    ).expect(201)
  ).body;
  await call(
    'post',
    '/auth/activations',
    { token: invitation.activationToken, password },
    null,
  ).expect(204);
  directorId = invitation.account.accountId;
  await call(
    'post',
    `/accounts/${directorId}/director-assignment`,
    {},
    adminCookie,
  ).expect(204);
  directorCookie = cookie(await signIn(email).expect(200));
  member = await operational();
  outsider = await operational('degree_student');
  institution = (
    await call('post', '/institutional/institutions', {
      id: randomUUID(),
      name: 'Example School',
      kind: 'school',
    }).expect(201)
  ).body;
});
afterAll(async () => {
  await fixture?.close();
});

test('validates personal notification routes and preserves a notification across application instances', async () => {
  await call('get', '/notifications', undefined, null).expect(401);
  await call('get', '/notifications', undefined, adminCookie).expect(403);
  await call(
    'get',
    '/notifications?accountId=' + member.id,
    undefined,
    member.credential,
  ).expect(400);
  await call(
    'get',
    '/notifications?cursor=invalid',
    undefined,
    member.credential,
  ).expect(400);
  const { record } = await create();
  app = await fixture.createApp();
  const page = (
    await call('get', '/notifications', undefined, member.credential).expect(
      200,
    )
  ).body;
  const notification = page.items.find((item) => item.resourceId === record.id);
  expect(notification).toBeDefined();
  await call(
    'post',
    `/notifications/${notification.id}/read`,
    { recipientAccountId: outsider.id },
    member.credential,
  ).expect(400);
});

test('computes agreement expiry for both display and filtering without overwriting its historical status', async () => {
  const { record } = await create({
    kind: 'agreement',
    type: 'agreement',
    startsAt: '2020-01-01',
    endsAt: '2020-12-31',
    institutionId: institution.id,
    venue: null,
  });
  const activated = (
    await call('post', `${path(record)}/status`, {
      version: 1,
      status: 'active',
      reason: 'Agreement was activated',
      results: null,
      reportedParticipants: null,
    }).expect(200)
  ).body;
  expect(activated.record.status).toBe('expired');
  const listed = (
    await call(
      'get',
      '/institutional/records?type=agreement&status=expired',
    ).expect(200)
  ).body;
  expect(listed.items.some((item) => item.id === record.id)).toBe(true);
  expect(
    (
      await fixture.owner.query(
        'SELECT agreement_status FROM projects.agreement WHERE id=$1',
        [record.id],
      )
    ).rows[0].agreement_status,
  ).toBe('active');
});

test('requires authentication and excludes technical administrators and unassigned students', async () => {
  await call('get', '/institutional/records', undefined, null).expect(401);
  await call('get', '/institutional/records', undefined, adminCookie).expect(
    403,
  );
  const { record } = await create();
  await call('get', path(record), undefined, member.credential).expect(200);
  await call('get', path(record), undefined, outsider.credential).expect(404);
  await call(
    'post',
    '/institutional/records',
    draft(),
    member.credential,
  ).expect(403);
  await call(
    'get',
    '/institutional/catalog',
    undefined,
    member.credential,
  ).expect(403);
});
test('creates independent activities without a project or agreement', async () => {
  const { record } = await create({ memberAccountIds: [] });
  expect(record).toMatchObject({
    kind: 'activity',
    type: 'talk',
    projectId: null,
    agreementId: null,
    status: 'planned',
    version: 1,
  });
});
test('creates basic projects and agreements and links an activity by identifiers', async () => {
  const project = await create({
    kind: 'project',
    type: 'program',
    title: 'Student wellbeing program',
    startsAt: '2026-01-01',
    endsAt: '2026-12-31',
    venue: null,
  });
  const agreement = await create({
    kind: 'agreement',
    type: 'agreement',
    title: 'School collaboration agreement',
    institutionId: institution.id,
    startsAt: '2026-01-01',
    endsAt: '2026-12-31',
    venue: null,
    code: `AG-${randomUUID().slice(0, 8)}`,
  });
  const activity = await create({
    projectId: project.record.id,
    agreementId: agreement.record.id,
  });
  expect(activity.record).toMatchObject({
    projectId: project.record.id,
    agreementId: agreement.record.id,
    institutionId: institution.id,
  });
  const related = (await call('get', path(project.record)).expect(200)).body
    .related;
  expect(related.some((item) => item.id === activity.record.id)).toBe(true);
  await call('post', `${path(project.record)}/archive`, {
    version: project.record.version,
    reason: 'Remove a linked project',
  }).expect(409);
});
test('notifies additions exactly once, keeps notifications private and acknowledges them idempotently', async () => {
  const input = draft();
  await call('post', '/institutional/records', input).expect(201);
  await call('post', '/institutional/records', input).expect(201);
  const list = (
    await call('get', '/notifications', undefined, member.credential).expect(
      200,
    )
  ).body;
  const notifications = list.items.filter(
    (item) => item.resourceId === input.id,
  );
  expect(notifications).toHaveLength(1);
  expect(notifications[0]).toMatchObject({
    resourceTitle: input.title,
    actorName: 'Carla Director',
    readAt: null,
  });
  const note = notifications[0];
  await call(
    'post',
    `/notifications/${note.id}/read`,
    {},
    outsider.credential,
  ).expect(404);
  await call(
    'post',
    `/notifications/${note.id}/read`,
    {},
    member.credential,
  ).expect(204);
  await call(
    'post',
    `/notifications/${note.id}/read`,
    {},
    member.credential,
  ).expect(204);
  const result = (
    await fixture.owner.query(
      'SELECT read_at FROM iam.user_notification WHERE id=$1',
      [note.id],
    )
  ).rows[0];
  expect(result.read_at).not.toBeNull();
});
test('changes team membership without repeating existing notifications and removes scoped access', async () => {
  const { record, input } = await create();
  const { id: _id, ...change } = input;
  const edited = await call('patch', path(record), {
    ...change,
    memberAccountIds: [member.id, outsider.id],
    version: record.version,
  }).expect(200);
  expect(edited.body.record.version).toBe(2);
  const notes = await fixture.owner.query(
    'SELECT recipient_account_id FROM iam.user_notification WHERE resource_id=$1',
    [record.id],
  );
  expect(notes.rows).toHaveLength(2);
  await call('patch', path(record), {
    ...change,
    memberAccountIds: [outsider.id],
    version: 2,
  }).expect(200);
  await call('get', path(record), undefined, member.credential).expect(404);
  await call('get', path(record), undefined, outsider.credential).expect(200);
  await call('patch', path(record), { ...change, version: 1 }).expect(409);
});
test('rejects forged actor fields, duplicate members, invalid dates and incompatible institutions', async () => {
  await call('post', '/institutional/records', {
    ...draft(),
    actorAccountId: directorId,
  }).expect(400);
  await call(
    'post',
    '/institutional/records',
    draft({ memberAccountIds: [member.id, member.id] }),
  ).expect(400);
  await call(
    'post',
    '/institutional/records',
    draft({ endsAt: '2026-01-02T12:00:00Z' }),
  ).expect(400);
  await call(
    'post',
    '/institutional/records',
    draft({
      kind: 'agreement',
      type: 'agreement',
      startsAt: '2026-01-01',
      endsAt: null,
      venue: null,
    }),
  ).expect(400);
  await call(
    'post',
    '/institutional/records',
    draft({ memberAccountIds: [randomUUID()] }),
  ).expect(409);
  await call(
    'post',
    '/institutional/records',
    draft({ responsibleAccountId: member.id }),
  ).expect(409);
});
test('completes without results or attendance and preserves immutable audit attribution', async () => {
  const { record } = await create();
  const result = await call('post', `${path(record)}/status`, {
    version: 1,
    status: 'completed',
    reason: 'Activity was completed',
    results: null,
    reportedParticipants: null,
  }).expect(200);
  expect(result.body.record).toMatchObject({
    status: 'completed',
    results: null,
    reportedParticipants: null,
    version: 2,
  });
  const audit = await fixture.owner.query(
    "SELECT actor_account_id,auth_session_id,request_id FROM audit.change_event WHERE schema_name='projects' AND table_name='activity' AND row_id=$1",
    [record.id],
  );
  expect(audit.rows.length).toBeGreaterThan(0);
  expect(audit.rows[0].actor_account_id).toBe(directorId);
  expect(audit.rows[0].auth_session_id).not.toBeNull();
});
test('edits a completed activity without reopening it and still enforces permissions and versions', async () => {
  const { input, record } = await create();
  const change = { ...input };
  delete change.id;
  await call('post', `${path(record)}/status`, {
    version: 1,
    status: 'completed',
    reason: 'Finalizar',
  }).expect(200);
  const edited = await call('patch', path(record), {
    ...change,
    version: 2,
    title: 'Corrected completed activity',
  }).expect(200);
  expect(edited.body.record).toMatchObject({
    status: 'completed',
    title: 'Corrected completed activity',
    version: 3,
  });
  await call('patch', path(record), { ...change, version: 2 }).expect(409);
  await call(
    'patch',
    path(record),
    { ...change, version: 3 },
    member.credential,
  ).expect(403);
  await call('patch', path(record), {
    ...change,
    version: 3,
    startsAt: '2099-01-01T13:00:00Z',
    endsAt: '2099-01-01T15:00:00Z',
  }).expect(400);
  await call('post', `${path(record)}/status`, {
    version: 3,
    status: 'completed',
    reason: 'Finalizar',
  }).expect(409);
});
test('archives logically, preserves its team history and hides the record', async () => {
  const { record } = await create();
  await call('post', `${path(record)}/archive`, {
    version: 1,
    reason: 'Created as test data',
  }).expect(204);
  await call('get', path(record)).expect(404);
  const result = await fixture.owner.query(
    'SELECT deleted_at,activity_status FROM projects.activity WHERE id=$1',
    [record.id],
  );
  expect(result.rows[0].deleted_at).not.toBeNull();
  expect(result.rows[0].activity_status).toBe('planned');
  const list = await call('get', '/institutional/records').expect(200);
  expect(list.body.items.some((item) => item.id === record.id)).toBe(false);
  expect(
    (
      await fixture.owner.query(
        'SELECT removed_at FROM projects.institutional_team WHERE activity_id=$1',
        [record.id],
      )
    ).rows.every((row) => row.removed_at !== null),
  ).toBe(true);
});
test('pages the unified list without exposing unrelated assignments', async () => {
  for (let index = 0; index < 3; index++)
    await create({
      title: `Pagination example ${index}`,
      memberAccountIds: [outsider.id],
    });
  const first = (
    await call(
      'get',
      '/institutional/records?limit=2&search=Pagination',
      undefined,
      outsider.credential,
    ).expect(200)
  ).body;
  expect(first.items).toHaveLength(2);
  expect(first.nextCursor).not.toBeNull();
  const second = (
    await call(
      'get',
      `/institutional/records?limit=2&search=Pagination&cursor=${first.nextCursor}`,
      undefined,
      outsider.credential,
    ).expect(200)
  ).body;
  expect(second.items).toHaveLength(1);
  expect(
    new Set([...first.items, ...second.items].map((item) => item.id)).size,
  ).toBe(3);
  const unrelated = (
    await call(
      'get',
      '/institutional/records?search=Pagination',
      undefined,
      member.credential,
    ).expect(200)
  ).body;
  expect(unrelated.items).toHaveLength(0);
});
test('runtime cannot physically delete records or rewrite notification contents', async () => {
  const { record } = await create();
  await expect(
    fixture.runtime.query('DELETE FROM projects.activity WHERE id=$1', [
      record.id,
    ]),
  ).rejects.toBeDefined();
  await expect(
    fixture.runtime.query(
      "UPDATE iam.user_notification SET resource_title='Forged title' WHERE resource_id=$1",
      [record.id],
    ),
  ).rejects.toBeDefined();
});
