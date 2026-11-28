import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, expect, test } from 'vitest';
import {
  createIdentityFixture,
  origin,
  password,
} from './helpers/identity-fixture.mjs';

let fixture,
  app,
  directorCookie,
  adminCookie,
  directorId,
  studentCookie,
  studentId,
  placement;
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
async function createStudent(role = 'assistant', names = {}) {
  const email = `practice-${randomUUID()}@example.test`;
  const invitation = (
    await call('post', '/accounts/operational-invitations', {
      givenNames: 'Test',
      familyNames: 'Practitioner',
      email,
      roleCodes: [role],
      ...names,
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
async function createTask(credential = studentCookie, overrides = {}) {
  return (
    await call(
      'post',
      `/practicum/placements/${placement.id}/tasks`,
      {
        id: randomUUID(),
        title: 'Administrative records',
        projectLabel: 'Gabinete',
        activityKind: 'administration',
        description: 'Prepare nonclinical records',
        startTimer: false,
        ...overrides,
      },
      credential,
    ).expect(201)
  ).body.task;
}
function interval(startMinutes, endMinutes) {
  const now = Date.now();
  return {
    startedAt: new Date(now - startMinutes * 60000).toISOString(),
    endedAt: new Date(now - endMinutes * 60000).toISOString(),
  };
}
function startTask(task, credential = studentCookie) {
  return call(
    'post',
    '/practicum/placements/' + placement.id + '/timer',
    { id: randomUUID(), taskId: task.id, description: null },
    credential,
  );
}
async function recordedInterval(task, times = interval(120, 60)) {
  // Historical fixture data, inserted only into the temporary local database.
  const id = randomUUID();
  const tx = await fixture.owner.connect();
  try {
    await tx.query('BEGIN');
    await tx.query(
      "SELECT audit.set_system_context('historical-timer-fixture',$1)",
      [randomUUID()],
    );
    await tx.query(
      "INSERT INTO practicum.activity_log(id,placement_id,task_id,student_person_id,task_title,project_label,activity_kind,description,started_at,ended_at,entry_source) SELECT $1,p.id,t.id,p.student_person_id,t.title,t.project_label,t.activity_kind,'Historical interval',$3,$4,'timer' FROM practicum.placement p JOIN practicum.work_task t ON t.placement_id=p.id WHERE t.id=$2",
      [id, task.id, times.startedAt, times.endedAt],
    );
    await tx.query('COMMIT');
  } catch (error) {
    await tx.query('ROLLBACK');
    throw error;
  } finally {
    tx.release();
  }
  const response = await call(
    'get',
    '/practicum/placements/' + placement.id + '/entries',
    undefined,
    studentCookie,
  ).expect(200);
  return { body: response.body.items.find((item) => item.id === id) };
}
async function attemptTimeTampering(id, field, value) {
  const tx = await fixture.owner.connect();
  try {
    await tx.query('BEGIN');
    await tx.query(
      "SELECT audit.set_system_context('test-time-immutability',$1)",
      [randomUUID()],
    );
    if (!['started_at', 'ended_at'].includes(field))
      throw Error('Unexpected field');
    await tx.query(
      'UPDATE practicum.activity_log SET ' +
        field +
        "=$1,change_reason='Attempted timestamp change' WHERE id=$2",
      [value, id],
    );
  } finally {
    await tx.query('ROLLBACK');
    tx.release();
  }
}
beforeAll(async () => {
  fixture = await createIdentityFixture({ practicum: true });
  app = await fixture.createApp();
  adminCookie = cookie(await signIn('administrator@example.test').expect(200));
  const email = 'practice-director@example.test';
  const candidate = (
    await call(
      'post',
      '/accounts/director-invitations',
      { givenNames: 'Test', familyNames: 'Director', email },
      adminCookie,
    ).expect(201)
  ).body;
  await call(
    'post',
    '/auth/activations',
    { token: candidate.activationToken, password },
    null,
  ).expect(204);
  directorId = candidate.account.accountId;
  await call(
    'post',
    `/accounts/${directorId}/director-assignment`,
    {},
    adminCookie,
  ).expect(204);
  directorCookie = cookie(await signIn(email).expect(200));
});

beforeEach(async () => {
  const student = await createStudent();
  studentId = student.id;
  studentCookie = student.credential;
  placement = (
    await call('post', '/practicum/my-placement', {}, studentCookie).expect(200)
  ).body;
});
afterAll(async () => {
  await fixture?.close();
});

test('denies anonymous access and keeps technical administrators outside practice data', async () => {
  await call('get', '/practicum/placements', undefined, null).expect(401);
  await call('get', '/practicum/placements', undefined, adminCookie).expect(
    403,
  );
  await call('post', '/practicum/placements', {
    studentAccountId: studentId,
    actorAccountId: directorId,
  }).expect(400);
  await call('get', '/practicum/catalog', undefined, studentCookie).expect(403);
});
test('initializes a new student time space without enrollment, supervisor or caller-supplied identity', async () => {
  const student = await createStudent('degree_student');
  const before = await fixture.owner.query(
    'SELECT p.id FROM practicum.placement p JOIN iam.account a ON a.person_id=p.student_person_id WHERE a.id=$1',
    [student.id],
  );
  expect(before.rows).toHaveLength(0);
  const directory = (
    await call('get', '/practicum/practitioners?limit=50').expect(200)
  ).body;
  const listed = directory.items.find(
    (item) => item.studentAccountId === student.id,
  );
  expect(listed).toMatchObject({ placementId: null, totalSeconds: 0 });
  await call(
    'get',
    '/practicum/practitioners',
    undefined,
    student.credential,
  ).expect(403);
  await call('get', '/practicum/practitioners', undefined, adminCookie).expect(
    403,
  );
  await call(
    'post',
    '/practicum/my-placement',
    { studentAccountId: studentId },
    student.credential,
  ).expect(400);
  const [first, retry] = await Promise.all([
    call('post', '/practicum/my-placement', {}, student.credential).expect(200),
    call('post', '/practicum/my-placement', {}, student.credential).expect(200),
  ]);
  expect(first.body.id).toBe(retry.body.id);
  expect(first.body.studentAccountId).toBe(student.id);
  expect(first.body).not.toHaveProperty('supervisorAccountId');
  const saved = await fixture.owner.query(
    'SELECT supervisor_account_id,version_no FROM practicum.placement WHERE id=$1',
    [first.body.id],
  );
  expect(saved.rows).toEqual([{ supervisor_account_id: null, version_no: 1 }]);
  await call('post', '/practicum/my-placement', {}, directorCookie).expect(403);
  await call(
    'get',
    `/practicum/placements/${first.body.id}/entries`,
    undefined,
    studentCookie,
  ).expect(404);
});
test('assigns an activity to a student without a supervisor and exposes it in that student options', async () => {
  const student = await createStudent();
  const target = (
    await call('post', '/practicum/placements', {
      studentAccountId: student.id,
    }).expect(201)
  ).body;
  const task = (
    await call('post', `/practicum/placements/${target.id}/tasks`, {
      id: randomUUID(),
      title: 'Prepare community workshop',
      projectLabel: 'Community activities',
      activityKind: 'other',
      description: 'Prepare the workshop materials',
      startTimer: false,
      entryId: null,
    }).expect(201)
  ).body.task;
  expect(task.assignedByDirector).toBe(true);
  const own = (
    await call(
      'post',
      '/practicum/my-placement',
      {},
      student.credential,
    ).expect(200)
  ).body;
  expect(own.id).toBe(target.id);
  const options = (
    await call(
      'get',
      `/practicum/placements/${target.id}/tasks`,
      undefined,
      student.credential,
    ).expect(200)
  ).body;
  expect(options.items[0]).toMatchObject({
    id: task.id,
    projectLabel: 'Community activities',
    title: 'Prepare community workshop',
  });
  const timer = (
    await call(
      'post',
      `/practicum/placements/${target.id}/timer`,
      { id: randomUUID(), taskId: task.id, description: 'Prepare first group' },
      student.credential,
    ).expect(201)
  ).body;
  await call(
    'post',
    `/practicum/entries/${timer.entry.id}/stop`,
    {},
    student.credential,
  ).expect(200);
  const recorded = (
    await call('get', `/practicum/placements/${target.id}/entries`).expect(200)
  ).body;
  expect(recorded.items[0]).toMatchObject({
    taskTitle: 'Prepare community workshop',
    projectLabel: 'Community activities',
  });
});
test('shows the same recorded intervals and totals to the director without approval', async () => {
  const task = await createTask();
  await recordedInterval(task, interval(180, 120));
  await recordedInterval(task, interval(110, 75));
  const path = `/practicum/placements/${placement.id}/entries`;
  const student = (
    await call('get', path, undefined, studentCookie).expect(200)
  ).body;
  const director = (await call('get', path).expect(200)).body;
  expect(director.items).toEqual(student.items);
  expect(student.totalSeconds).toBe(5700);
  expect(student.entryCount).toBe(2);
  expect(director.totalSeconds).toBe(5700);
  expect(student.items[0]).not.toHaveProperty('approvalStatus');
  expect(
    (
      await fixture.owner.query(
        'SELECT DISTINCT approval_status FROM practicum.activity_log WHERE placement_id=$1',
        [placement.id],
      )
    ).rows,
  ).toEqual([{ approval_status: 'recorded' }]);
  const list = (await call('get', '/practicum/placements').expect(200)).body;
  expect(list.items.find((item) => item.id === placement.id).totalSeconds).toBe(
    5700,
  );
  const own = (
    await call(
      'get',
      '/practicum/my-placements',
      undefined,
      studentCookie,
    ).expect(200)
  ).body;
  expect(own.items.map((item) => item.id)).toEqual([placement.id]);
  expect(own.items[0].totalSeconds).toBe(5700);
  await call('get', '/practicum/my-placements').expect(403);
  const reported = await fixture.owner.query(
    'SELECT total_seconds::integer FROM reporting.v_practicum_recorded_hours WHERE placement_id=$1',
    [placement.id],
  );
  expect(reported.rows[0].total_seconds).toBe(5700);
});
test('reuses one profile without registration or supervisor and finishes or reopens it without losing time', async () => {
  expect(placement).not.toHaveProperty('termId');
  expect(placement).not.toHaveProperty('startsOn');
  const legacy = await fixture.owner.query(
    'SELECT term_id,placement_kind,started_on,ended_on FROM practicum.placement WHERE id=$1',
    [placement.id],
  );
  expect(legacy.rows[0]).toEqual({
    term_id: null,
    placement_kind: null,
    started_on: null,
    ended_on: null,
  });
  await call('post', '/practicum/placements', {
    studentAccountId: studentId,
  }).expect(201);
  const task = await createTask();
  await recordedInterval(task, {
    startedAt: '2025-01-02T12:00:00Z',
    endedAt: '2025-01-02T13:00:00Z',
  });
  const finished = (
    await call('patch', `/practicum/placements/${placement.id}`, {
      status: 'completed',
      version: placement.version,
      reason: 'Practice finished',
    }).expect(200)
  ).body;
  await startTask(task).expect(409);
  const page = (
    await call(
      'get',
      `/practicum/placements/${placement.id}/entries`,
      undefined,
      studentCookie,
    ).expect(200)
  ).body;
  expect(page.totalSeconds).toBe(3600);
  await call('patch', `/practicum/placements/${placement.id}`, {
    status: 'active',
    version: finished.version,
    reason: 'Continue practice',
  }).expect(200);
  await recordedInterval(task);
});
test('orders the directory alphabetically across pages, including accented vowel names', async () => {
  for (const givenNames of ['Zoe', 'Álvaro']) {
    const student = await createStudent('assistant', {
      givenNames,
      familyNames: 'Directory',
    });
    await call('post', '/practicum/placements', {
      studentAccountId: student.id,
    }).expect(201);
  }
  const items = [];
  let cursor = null;
  do {
    const query = cursor
      ? `?limit=3&cursor=${encodeURIComponent(cursor)}`
      : '?limit=3';
    const page = (
      await call('get', `/practicum/practitioners${query}`).expect(200)
    ).body;
    items.push(...page.items);
    cursor = page.nextCursor;
  } while (cursor);
  expect(items[0].studentName).toBe('Álvaro Directory');
  expect(items.at(-1).studentName).toBe('Zoe Directory');
  expect(new Set(items.map((item) => item.studentAccountId)).size).toBe(
    items.length,
  );
  await call('get', '/practicum/practitioners?cursor=invalid').expect(400);
});
test('lets the student create and resume a task as independent time intervals', async () => {
  const task = await createTask();
  expect(task.assignedByDirector).toBe(false);
  const original = (await recordedInterval(task)).body;
  const ids = [original.id];
  for (let iteration = 0; iteration < 2; iteration++) {
    const body = {
      id: randomUUID(),
      taskId: task.id,
      description: 'Resumed work',
    };
    await call(
      'post',
      `/practicum/placements/${placement.id}/timer`,
      body,
      studentCookie,
    ).expect(201);
    const stopped = (
      await call(
        'post',
        `/practicum/entries/${body.id}/stop`,
        {},
        studentCookie,
      ).expect(200)
    ).body;
    expect(stopped.taskId).toBe(task.id);
    ids.push(stopped.id);
  }
  const page = (
    await call(
      'get',
      `/practicum/placements/${placement.id}/entries`,
      undefined,
      studentCookie,
    ).expect(200)
  ).body;
  expect(page.items).toHaveLength(3);
  expect(new Set(ids).size).toBe(3);
  expect(page.items.find((item) => item.id === original.id).endedAt).toBe(
    original.endedAt,
  );
});
test('persists a timer across sessions and makes start and stop retries idempotent', async () => {
  const task = await createTask();
  const body = { id: randomUUID(), taskId: task.id, description: null };
  const start = (
    await call(
      'post',
      `/practicum/placements/${placement.id}/timer`,
      body,
      studentCookie,
    ).expect(201)
  ).body;
  const retry = (
    await call(
      'post',
      `/practicum/placements/${placement.id}/timer`,
      body,
      studentCookie,
    ).expect(201)
  ).body;
  expect(retry.entry.startedAt).toBe(start.entry.startedAt);
  const secondApp = await fixture.createApp();
  const restored = await request(secondApp.getHttpServer())
    .get('/practicum/running-timer')
    .set('Cookie', studentCookie)
    .expect(200);
  expect(restored.body.entry.id).toBe(body.id);
  const stopped = (
    await call(
      'post',
      `/practicum/entries/${body.id}/stop`,
      {},
      studentCookie,
    ).expect(200)
  ).body;
  const stoppedAgain = (
    await call(
      'post',
      `/practicum/entries/${body.id}/stop`,
      {},
      studentCookie,
    ).expect(200)
  ).body;
  expect(stoppedAgain.endedAt).toBe(stopped.endedAt);
  expect(stoppedAgain.version).toBe(stopped.version);
  expect(
    (await call('get', '/practicum/running-timer', undefined, studentCookie))
      .body.entry,
  ).toBeNull();
});
test('allows only one timer under competing requests and rolls back create-and-start on conflict', async () => {
  const task = await createTask();
  const results = await Promise.all(
    [1, 2].map(() =>
      call(
        'post',
        `/practicum/placements/${placement.id}/timer`,
        { id: randomUUID(), taskId: task.id, description: null },
        studentCookie,
      ),
    ),
  );
  expect(results.map((item) => item.status).sort()).toEqual([201, 409]);
  const taskId = randomUUID();
  await call(
    'post',
    `/practicum/placements/${placement.id}/tasks`,
    {
      id: taskId,
      title: 'Should roll back',
      projectLabel: 'Gabinete',
      activityKind: 'administration',
      description: null,
      startTimer: true,
      entryId: randomUUID(),
    },
    studentCookie,
  ).expect(409);
  expect(
    (
      await fixture.owner.query(
        'SELECT id FROM practicum.work_task WHERE id=$1',
        [taskId],
      )
    ).rows,
  ).toHaveLength(0);
  await call('patch', `/practicum/placements/${placement.id}`, {
    status: 'completed',
    version: placement.version,
    reason: 'Practice completed',
  }).expect(409);
});
test('rejects manual recording and time editing in both the API and PostgreSQL', async () => {
  const task = await createTask();
  await call(
    'post',
    '/practicum/placements/' + placement.id + '/entries',
    { id: randomUUID(), taskId: task.id, ...interval(120, 60) },
    studentCookie,
  ).expect(404);
  const entry = (await recordedInterval(task)).body;
  const input = {
    title: 'Edited labels',
    projectLabel: 'Gabinete',
    description: null,
    version: entry.version,
  };
  for (const credential of [studentCookie]) {
    for (const field of ['startedAt', 'endedAt', 'durationSeconds'])
      await call(
        'patch',
        '/practicum/entries/' + entry.id,
        { ...input, [field]: '2026-01-01T00:00:00Z' },
        credential,
      ).expect(400);
  }
  await expect(
    attemptTimeTampering(entry.id, 'started_at', interval(180, 120).startedAt),
  ).rejects.toThrow();
  await expect(
    attemptTimeTampering(entry.id, 'ended_at', interval(180, 120).endedAt),
  ).rejects.toThrow();
});
test('stores the captured stop time and rejects arbitrary times without altering the running interval', async () => {
  const task = await createTask();
  const started = (await startTask(task).expect(201)).body.entry;
  const path = '/practicum/entries/' + started.id + '/stop';
  await call(
    'post',
    path,
    { stoppedAt: '2000-01-01T00:00:00Z' },
    studentCookie,
  ).expect(409);
  await call('post', path, { stoppedAt: 'invalid' }, studentCookie).expect(400);
  const stoppedAt = new Date().toISOString();
  const stopped = (
    await call('post', path, { stoppedAt }, studentCookie).expect(200)
  ).body;
  expect(new Date(stopped.endedAt).toISOString()).toBe(stoppedAt);
  const retry = (
    await call(
      'post',
      path,
      { stoppedAt: new Date().toISOString() },
      studentCookie,
    ).expect(200)
  ).body;
  expect(new Date(retry.endedAt).toISOString()).toBe(stoppedAt);
});
test('prevents access to another student and scopes supervisors to assigned placements', async () => {
  const outsider = await createStudent();
  await call(
    'get',
    `/practicum/placements/${placement.id}/entries`,
    undefined,
    outsider.credential,
  ).expect(404);
  const task = await createTask();
  await startTask(task, outsider.credential).expect(404);
  const supervisor = await createStudent('psychologist');
  expect(
    (
      await call(
        'get',
        '/practicum/placements',
        undefined,
        supervisor.credential,
      )
    ).body.items,
  ).toHaveLength(0);
  const legacy = await fixture.owner.connect();
  try {
    await legacy.query('BEGIN');
    await legacy.query(
      "SELECT audit.set_system_context('legacy-supervisor-test',$1)",
      [randomUUID()],
    );
    await legacy.query(
      'UPDATE practicum.placement SET supervisor_account_id=$1,change_reason=$2 WHERE id=$3',
      [supervisor.id, 'Preserve historical supervisor scope', placement.id],
    );
    await legacy.query('COMMIT');
  } finally {
    legacy.release();
  }
  await call(
    'get',
    `/practicum/placements/${placement.id}/entries`,
    undefined,
    supervisor.credential,
  ).expect(200);
  await startTask(task, supervisor.credential).expect(403);
});
test('edits only one entry labels, preserves exact time and keeps attributable revisions and logical deletion', async () => {
  const task = await createTask();
  const entry = (await recordedInterval(task)).body;
  const other = (await recordedInterval(task, interval(180, 150))).body;
  const input = {
    title: 'Workshop materials',
    projectLabel: 'Community workshop',
    description: 'Prepare handouts',
    version: entry.version,
  };
  const edited = (
    await call(
      'patch',
      '/practicum/entries/' + entry.id,
      input,
      studentCookie,
    ).expect(200)
  ).body;
  expect(edited).toMatchObject({
    taskTitle: input.title,
    projectLabel: input.projectLabel,
    description: input.description,
    startedAt: entry.startedAt,
    endedAt: entry.endedAt,
    durationSeconds: entry.durationSeconds,
    version: entry.version + 1,
  });
  await call(
    'patch',
    '/practicum/entries/' + entry.id,
    input,
    studentCookie,
  ).expect(409);
  const page = (
    await call(
      'get',
      '/practicum/placements/' + placement.id + '/entries',
    ).expect(200)
  ).body;
  expect(page.items.find((item) => item.id === other.id)).toEqual(other);
  const revision = (
    await fixture.owner.query(
      'SELECT previous_task_title,previous_project_label,actor_account_id,auth_session_id FROM practicum.time_entry_revision WHERE entry_id=$1 ORDER BY changed_at DESC LIMIT 1',
      [entry.id],
    )
  ).rows[0];
  expect(revision).toMatchObject({
    previous_task_title: entry.taskTitle,
    previous_project_label: entry.projectLabel,
    actor_account_id: studentId,
  });
  expect(revision.auth_session_id).toEqual(expect.any(String));
  await call(
    'post',
    '/practicum/entries/' + entry.id + '/void',
    { version: edited.version, reason: 'Time entry deleted by user' },
    studentCookie,
  ).expect(200);
  const after = (
    await call(
      'get',
      '/practicum/placements/' + placement.id + '/entries',
    ).expect(200)
  ).body;
  expect(after.items.map((item) => item.id)).toEqual([other.id]);
  expect(after.totalSeconds).toBe(other.durationSeconds);
  expect(
    (
      await fixture.owner.query(
        'SELECT voided_at FROM practicum.activity_log WHERE id=$1',
        [entry.id],
      )
    ).rows[0].voided_at,
  ).not.toBeNull();
  await expect(
    fixture.runtime.query('DELETE FROM practicum.activity_log WHERE id=$1', [
      entry.id,
    ]),
  ).rejects.toThrow();
  await expect(
    fixture.owner.query(
      'UPDATE practicum.time_entry_revision SET reason=$1 WHERE entry_id=$2',
      ['Tampered reason', entry.id],
    ),
  ).rejects.toThrow();
});
test('keeps director access read-only for student intervals while retaining assignments', async () => {
  const task = await createTask();
  const entry = (await recordedInterval(task)).body;
  const details = {
    title: 'Edited activity',
    projectLabel: 'Gabinete',
    description: null,
    version: entry.version,
  };
  await call(
    'patch',
    '/practicum/entries/' + entry.id,
    details,
    directorCookie,
  ).expect(403);
  await call(
    'post',
    '/practicum/entries/' + entry.id + '/void',
    { version: entry.version, reason: 'Delete student record' },
    directorCookie,
  ).expect(403);
  await call(
    'post',
    '/practicum/entries/' + entry.id + '/resume',
    { id: randomUUID() },
    directorCookie,
  ).expect(403);
  const page = (
    await call(
      'get',
      '/practicum/placements/' + placement.id + '/entries',
    ).expect(200)
  ).body;
  expect(page.items[0]).toEqual(entry);
  expect((await createTask(directorCookie)).assignedByDirector).toBe(true);
});
test('resumes the selected row details as a new timer, preserves original hours, and scopes edits to the owner', async () => {
  const task = await createTask();
  const entry = (await recordedInterval(task)).body;
  const input = {
    title: 'Edited activity',
    projectLabel: 'New project',
    description: 'Entry-specific description',
    version: entry.version,
  };
  const edited = (
    await call(
      'patch',
      '/practicum/entries/' + entry.id,
      input,
      studentCookie,
    ).expect(200)
  ).body;
  const outsider = await createStudent();
  await call(
    'patch',
    '/practicum/entries/' + entry.id,
    { ...input, version: edited.version },
    outsider.credential,
  ).expect(404);
  await call(
    'post',
    '/practicum/entries/' + entry.id + '/resume',
    { id: randomUUID() },
    outsider.credential,
  ).expect(404);
  await call(
    'post',
    '/practicum/entries/' + entry.id + '/resume',
    { id: randomUUID() },
    directorCookie,
  ).expect(403);
  const id = randomUUID();
  const path = '/practicum/entries/' + entry.id + '/resume';
  const first = (await call('post', path, { id }, studentCookie).expect(201))
    .body.entry;
  const retry = (await call('post', path, { id }, studentCookie).expect(201))
    .body.entry;
  expect(first).toMatchObject({
    id,
    taskTitle: input.title,
    projectLabel: input.projectLabel,
    description: input.description,
    endedAt: null,
  });
  expect(retry.startedAt).toBe(first.startedAt);
  await call('post', path, { id: randomUUID() }, studentCookie).expect(409);
  await call(
    'post',
    '/practicum/entries/' + id + '/stop',
    {},
    studentCookie,
  ).expect(200);
  const page = (
    await call(
      'get',
      '/practicum/placements/' + placement.id + '/entries',
    ).expect(200)
  ).body;
  expect(page.items.find((item) => item.id === entry.id)).toEqual(edited);
});
test('creates director-assigned tasks and prevents time from being added to completed tasks', async () => {
  const task = await createTask(directorCookie);
  expect(task.assignedByDirector).toBe(true);
  expect(
    (
      await call(
        'get',
        `/practicum/placements/${placement.id}/tasks`,
        undefined,
        studentCookie,
      )
    ).body.items[0].id,
  ).toBe(task.id);
  await call(
    'patch',
    `/practicum/placements/${placement.id}/tasks/${task.id}`,
    { status: 'completed', version: task.version, reason: null },
    studentCookie,
  ).expect(403);
  await call(
    'patch',
    '/practicum/placements/' + placement.id + '/tasks/' + task.id,
    { status: 'completed', version: task.version, reason: null },
  ).expect(200);
  await startTask(task).expect(409);
});
