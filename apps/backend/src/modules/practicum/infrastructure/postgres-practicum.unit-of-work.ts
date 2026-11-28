import { sql } from 'drizzle-orm';
import type { AppTransaction } from '../../../infrastructure/database/database.types.js';
import type {
  AccountOption,
  EntryChange,
  EntryRevision,
  NewTask,
  PageQuery,
  Placement,
  PlacementChange,
  PracticeTask,
  PracticumCatalog,
  Practitioner,
  PracticumUnitOfWork,
  TaskChange,
  TimeEntry,
} from '../application/practicum.contracts.js';
import type { AccessIdentity } from '../domain/practicum.rules.js';
import {
  canManagePracticum,
  PracticumError,
} from '../domain/practicum.rules.js';
import {
  entryColumns,
  entryCursor,
  entryPage,
  pageOf,
  placementColumns,
  placementCursor,
  placementJoins,
  placementOrderName,
  placementScope,
  taskColumns,
  uuidCursor,
} from './practicum.queries.js';

export class PostgresPracticumUnitOfWork implements PracticumUnitOfWork {
  constructor(
    private readonly tx: AppTransaction,
    readonly identity: AccessIdentity,
    readonly now: string,
  ) {}
  async catalog(): Promise<PracticumCatalog> {
    const students = await this.tx
      .execute<AccountOption>(sql`SELECT a.id,concat_ws(' ',person.given_names,person.family_names) AS name,a.email
      FROM iam.account a JOIN core.person person ON person.id=a.person_id
      WHERE a.account_status='active' AND person.active AND EXISTS(SELECT 1 FROM iam.account_role ar JOIN iam.role r ON r.id=ar.role_id
        WHERE ar.account_id=a.id AND ar.revoked_at IS NULL AND r.active AND r.code IN ('assistant','degree_student'))
      ORDER BY ${placementOrderName},a.id LIMIT 200`);
    return { students: students.rows };
  }
  async assertEligibleStudent(id: string): Promise<void> {
    await this.tx.execute(
      sql`SELECT id FROM iam.account WHERE id=${id}::uuid FOR SHARE`,
    );
    const result = await this.tx
      .execute(sql`SELECT a.id FROM iam.account a JOIN core.person person ON person.id=a.person_id
      WHERE a.id=${id}::uuid AND a.account_status='active' AND person.active AND EXISTS(SELECT 1 FROM iam.account_role ar JOIN iam.role r ON r.id=ar.role_id
        WHERE ar.account_id=a.id AND ar.revoked_at IS NULL AND r.active AND r.code IN ('assistant','degree_student'))`);
    if (!result.rows.length) throw new PracticumError('invalid_input');
  }
  async ensurePlacement(studentAccountId: string): Promise<Placement> {
    await this.tx
      .execute(sql`INSERT INTO practicum.placement(student_person_id,placement_status)
      SELECT person_id,'active' FROM iam.account WHERE id=${studentAccountId}::uuid
      ON CONFLICT(student_person_id) DO NOTHING`);
    const result = await this.tx.execute<{ id: string }>(
      sql`SELECT p.id FROM practicum.placement p JOIN iam.account a ON a.person_id=p.student_person_id WHERE a.id=${studentAccountId}::uuid`,
    );
    if (!result.rows[0]) throw new PracticumError('not_found');
    return this.placement(result.rows[0].id);
  }
  async directory(query: PageQuery) {
    const cursor = placementCursor(query.cursor);
    const rows = (
      await this.tx.execute<
        Practitioner & { sortName: string }
      >(sql`SELECT p.id AS "placementId",a.id AS "studentAccountId",
      concat_ws(' ',person.given_names,person.family_names) AS "studentName",a.email AS "studentEmail",
      COALESCE(p.placement_status,'active') AS status,${placementOrderName} AS "sortName",
      COALESCE((SELECT floor(sum(extract(epoch FROM (l.ended_at-l.started_at))))::float8 FROM practicum.activity_log l WHERE l.placement_id=p.id AND l.ended_at IS NOT NULL AND l.voided_at IS NULL),0) AS "totalSeconds",
      (SELECT count(*)::integer FROM practicum.activity_log l WHERE l.placement_id=p.id AND l.ended_at IS NOT NULL AND l.voided_at IS NULL) AS "entryCount",
      EXISTS(SELECT 1 FROM practicum.activity_log l WHERE l.placement_id=p.id AND l.ended_at IS NULL AND l.voided_at IS NULL) AS "hasRunningTimer"
      FROM iam.account a JOIN core.person person ON person.id=a.person_id LEFT JOIN practicum.placement p ON p.student_person_id=person.id
      WHERE (p.id IS NOT NULL OR (a.account_status='active' AND person.active AND EXISTS(SELECT 1 FROM iam.account_role ar JOIN iam.role r ON r.id=ar.role_id
        WHERE ar.account_id=a.id AND ar.revoked_at IS NULL AND r.active AND r.code IN ('assistant','degree_student'))))
      ${cursor ? sql`AND (${placementOrderName},a.id)>(${cursor.sortName}::text COLLATE "C",${cursor.id}::uuid)` : sql``}
      ORDER BY ${placementOrderName},a.id LIMIT ${query.limit + 1}`)
    ).rows;
    const page = rows.slice(0, query.limit);
    const last = page.at(-1);
    return {
      items: page.map(({ sortName: _sortName, ...person }) => person),
      nextCursor:
        rows.length > query.limit && last
          ? Buffer.from(
              JSON.stringify({
                id: last.studentAccountId,
                sortName: last.sortName,
              }),
            ).toString('base64url')
          : null,
    };
  }
  async listPlacements(query: PageQuery, onlyOwn = false) {
    const cursor = placementCursor(query.cursor);
    const rows = (
      await this.tx.execute<
        Placement & { sortName: string }
      >(sql`SELECT ${placementColumns},${placementOrderName} AS "sortName" FROM ${placementJoins} WHERE ${placementScope(this.identity)}
      ${onlyOwn ? sql`AND a.id=${this.identity.accountId}::uuid` : sql``}
       ${cursor ? sql`AND (${placementOrderName},p.id)>(${cursor.sortName}::text COLLATE "C",${cursor.id}::uuid)` : sql``}
       ORDER BY ${placementOrderName},p.id ASC LIMIT ${query.limit + 1}`)
    ).rows;
    const page = rows.slice(0, query.limit);
    const last = page.at(-1);
    return {
      items: page.map(({ sortName: _sortName, ...placement }) => placement),
      nextCursor:
        rows.length > query.limit && last
          ? Buffer.from(
              JSON.stringify({ id: last.id, sortName: last.sortName }),
            ).toString('base64url')
          : null,
    };
  }
  async placement(id: string, lock = false): Promise<Placement> {
    if (lock)
      await this.tx.execute(
        sql`SELECT p.id FROM ${placementJoins} WHERE p.id=${id}::uuid AND ${placementScope(this.identity)} FOR UPDATE OF p`,
      );
    const placement = (
      await this.tx.execute<Placement>(
        sql`SELECT ${placementColumns} FROM ${placementJoins} WHERE p.id=${id}::uuid AND ${placementScope(this.identity)}`,
      )
    ).rows[0];
    if (!placement) throw new PracticumError('not_found');
    return placement;
  }
  async updatePlacement(
    id: string,
    input: PlacementChange,
  ): Promise<Placement> {
    const result = await this.tx
      .execute(sql`UPDATE practicum.placement SET placement_status=${input.status},change_reason=${input.reason}
      WHERE id=${id}::uuid AND version_no=${input.version} RETURNING id`);
    if (!result.rows.length) throw new PracticumError('version_conflict');
    return this.placement(id);
  }
  async tasks(placementId: string, query: PageQuery) {
    const cursor = uuidCursor(query);
    const rows = (
      await this.tx
        .execute<PracticeTask>(sql`SELECT ${taskColumns} FROM practicum.work_task t WHERE t.placement_id=${placementId}::uuid
      ${cursor ? sql`AND t.id<${cursor}::uuid` : sql``} ORDER BY t.id DESC LIMIT ${query.limit + 1}`)
    ).rows;
    return pageOf(rows, query.limit);
  }
  async task(
    id: string,
    placementId: string,
    lock = false,
  ): Promise<PracticeTask> {
    const task = (
      await this.tx.execute<PracticeTask>(
        sql`SELECT ${taskColumns} FROM practicum.work_task t WHERE t.id=${id}::uuid AND t.placement_id=${placementId}::uuid ${lock ? sql`FOR UPDATE OF t` : sql``}`,
      )
    ).rows[0];
    if (!task) throw new PracticumError('not_found');
    return task;
  }
  async createTask(placementId: string, input: NewTask): Promise<PracticeTask> {
    const existing = (
      await this.tx.execute<PracticeTask>(
        sql`SELECT ${taskColumns} FROM practicum.work_task t WHERE t.id=${input.id}::uuid`,
      )
    ).rows[0];
    if (existing) {
      if (
        existing.placementId !== placementId ||
        existing.createdByAccountId !== this.identity.accountId ||
        existing.title !== input.title ||
        existing.projectLabel !== input.projectLabel ||
        existing.activityKind !== input.activityKind ||
        existing.description !== input.description
      )
        throw new PracticumError('duplicate');
      return existing;
    }
    await this.tx
      .execute(sql`INSERT INTO practicum.work_task(id,placement_id,title,project_label,activity_kind,description,assigned_by_director)
      VALUES(${input.id}::uuid,${placementId}::uuid,${input.title},${input.projectLabel},${input.activityKind},${input.description},${canManagePracticum(this.identity)})`);
    return this.task(input.id, placementId);
  }
  async updateTask(id: string, input: TaskChange): Promise<PracticeTask> {
    const running = await this.tx.execute(
      sql`SELECT id FROM practicum.activity_log WHERE task_id=${id}::uuid AND ended_at IS NULL AND voided_at IS NULL LIMIT 1`,
    );
    if (running.rows.length && input.status !== 'active')
      throw new PracticumError('timer_running');
    const result = await this.tx.execute<{
      placementId: string;
    }>(sql`UPDATE practicum.work_task SET task_status=${input.status},change_reason=${input.reason}
      WHERE id=${id}::uuid AND version_no=${input.version} RETURNING placement_id AS "placementId"`);
    if (!result.rows.length) throw new PracticumError('version_conflict');
    return this.task(id, result.rows[0].placementId);
  }
  async entry(id: string, lock = false): Promise<TimeEntry> {
    const entry = (
      await this.tx
        .execute<TimeEntry>(sql`SELECT ${entryColumns} FROM practicum.activity_log l JOIN practicum.placement p ON p.id=l.placement_id
      JOIN iam.account a ON a.person_id=p.student_person_id WHERE l.id=${id}::uuid AND ${placementScope(this.identity)} ${lock ? sql`FOR UPDATE OF l` : sql``}`)
    ).rows[0];
    if (!entry) throw new PracticumError('not_found');
    return entry;
  }
  async entries(placementId: string, query: PageQuery) {
    const cursor = entryCursor(query.cursor);
    const rows = (
      await this.tx
        .execute<TimeEntry>(sql`SELECT ${entryColumns} FROM practicum.activity_log l WHERE l.placement_id=${placementId}::uuid
      AND l.voided_at IS NULL
      ${cursor ? sql`AND (l.started_at,l.id)<(${cursor.startedAt}::timestamptz,${cursor.id}::uuid)` : sql``}
      ORDER BY l.started_at DESC,l.id DESC LIMIT ${query.limit + 1}`)
    ).rows;
    const totals = (
      await this.tx.execute<{
        totalSeconds: number;
        entryCount: number;
      }>(sql`SELECT COALESCE(floor(sum(extract(epoch FROM (ended_at-started_at))))::float8,0) AS "totalSeconds",count(*)::integer AS "entryCount"
      FROM practicum.activity_log WHERE placement_id=${placementId}::uuid AND ended_at IS NOT NULL AND voided_at IS NULL`)
    ).rows[0];
    return { ...entryPage(rows, query.limit), ...totals, serverNow: this.now };
  }
  async runningTimer() {
    const entry =
      (
        await this.tx
          .execute<TimeEntry>(sql`SELECT ${entryColumns} FROM practicum.activity_log l JOIN iam.account a ON a.person_id=l.student_person_id
      WHERE a.id=${this.identity.accountId}::uuid AND l.ended_at IS NULL AND l.voided_at IS NULL LIMIT 1`)
      ).rows[0] ?? null;
    return { entry, serverNow: this.now };
  }
  async insertEntry(
    placement: Placement,
    task: PracticeTask,
    input: Readonly<{
      id: string;
      startedAt: string;
      endedAt: string | null;
      description: string | null;
      source: 'manual' | 'timer';
    }>,
  ) {
    // The person lock also serializes writes across different placements and browser sessions.
    await this.tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtextextended('practicum.person:'||student_person_id::text,0)) FROM practicum.placement WHERE id=${placement.id}::uuid`,
    );
    const existing = (
      await this.tx.execute<TimeEntry>(
        sql`SELECT ${entryColumns} FROM practicum.activity_log l WHERE l.id=${input.id}::uuid`,
      )
    ).rows[0];
    if (existing) {
      if (
        existing.placementId !== placement.id ||
        existing.taskId !== task.id ||
        existing.source !== input.source ||
        existing.description !== input.description ||
        (input.source === 'manual' &&
          (Date.parse(existing.startedAt) !== Date.parse(input.startedAt) ||
            Date.parse(existing.endedAt!) !== Date.parse(input.endedAt!)))
      )
        throw new PracticumError('duplicate');
      return existing;
    }
    if (input.endedAt === null) {
      const running = await this.runningTimer();
      if (running.entry) throw new PracticumError('timer_running');
    }
    await this.tx
      .execute(sql`INSERT INTO practicum.activity_log(id,placement_id,task_id,student_person_id,task_title,project_label,activity_kind,description,started_at,ended_at,entry_source)
      SELECT ${input.id}::uuid,p.id,${task.id}::uuid,p.student_person_id,${task.title},${task.projectLabel},${task.activityKind},${input.description},${input.startedAt}::timestamptz,${input.endedAt}::timestamptz,${input.source}
      FROM practicum.placement p WHERE p.id=${placement.id}::uuid`);
    return this.entry(input.id);
  }
  async stopEntry(id: string, endedAt: string) {
    await this.tx.execute(
      sql`UPDATE practicum.activity_log SET ended_at=${endedAt}::timestamptz,change_reason='Timer stopped' WHERE id=${id}::uuid AND ended_at IS NULL AND voided_at IS NULL`,
    );
    return this.entry(id);
  }
  async resolveEntryTask(
    placementId: string,
    details: Pick<EntryChange, 'title' | 'projectLabel' | 'description'>,
  ): Promise<PracticeTask> {
    // The caller locks the placement, so simultaneous edits cannot create duplicate definitions.
    const existing = (
      await this.tx
        .execute<PracticeTask>(sql`SELECT ${taskColumns} FROM practicum.work_task t
      WHERE t.placement_id=${placementId}::uuid AND t.task_status='active'
      AND t.title=${details.title} AND t.project_label=${details.projectLabel}
      ORDER BY t.assigned_by_director DESC,t.id LIMIT 1`)
    ).rows[0];
    if (existing) return existing;
    const created = (
      await this.tx.execute<{
        id: string;
      }>(sql`INSERT INTO practicum.work_task(placement_id,title,project_label,activity_kind,description,assigned_by_director)
      VALUES(${placementId}::uuid,${details.title},${details.projectLabel},'other',${details.description},false) RETURNING id`)
    ).rows[0];
    return this.task(created.id, placementId);
  }
  async editEntry(id: string, task: PracticeTask, input: EntryChange) {
    const result = await this.tx
      .execute(sql`UPDATE practicum.activity_log SET task_id=${task.id}::uuid,task_title=${task.title},project_label=${task.projectLabel},activity_kind=${task.activityKind},description=${input.description},change_reason='Entry details edited'
      WHERE id=${id}::uuid AND version_no=${input.version} AND voided_at IS NULL RETURNING id`);
    if (!result.rows.length) throw new PracticumError('version_conflict');
    return this.entry(id);
  }
  async voidEntry(id: string, version: number, reason: string) {
    const result = await this.tx.execute(
      sql`UPDATE practicum.activity_log SET voided_at=clock_timestamp(),change_reason=${reason} WHERE id=${id}::uuid AND version_no=${version} AND voided_at IS NULL RETURNING id`,
    );
    if (!result.rows.length) throw new PracticumError('version_conflict');
    return this.entry(id);
  }
  async revisions(id: string): Promise<readonly EntryRevision[]> {
    return (
      await this.tx
        .execute<EntryRevision>(sql`SELECT id,action,changed_at::text AS "changedAt",reason,previous_started_at::text AS "previousStartedAt",previous_ended_at::text AS "previousEndedAt",
      previous_description AS "previousDescription",actor_account_id AS "actorAccountId",auth_session_id AS "sessionId",request_id AS "requestId"
      FROM practicum.time_entry_revision WHERE entry_id=${id}::uuid ORDER BY changed_at DESC,id DESC LIMIT 100`)
    ).rows;
  }
}
