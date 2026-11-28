import { sql } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';
import type { AccessIdentity } from '../domain/practicum.rules.js';
import {
  canManagePracticum,
  PracticumError,
  validDate,
} from '../domain/practicum.rules.js';
import type {
  Page,
  PageQuery,
  TimeEntry,
} from '../application/practicum.contracts.js';

export const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
export function placementScope(identity: AccessIdentity): SQL {
  if (canManagePracticum(identity)) return sql`TRUE`;
  const own =
    identity.roles.some(
      (role) => role === 'assistant' || role === 'degree_student',
    ) && identity.permissions.includes('practicum.read_own');
  const supervised =
    identity.roles.includes('psychologist') &&
    identity.permissions.includes('practicum.read_supervised');
  return sql`((${own} AND a.id=${identity.accountId}::uuid) OR (${supervised} AND p.supervisor_account_id=${identity.accountId}::uuid))`;
}
export const placementColumns = sql`p.id,a.id AS "studentAccountId",concat_ws(' ',person.given_names,person.family_names) AS "studentName",a.email AS "studentEmail",
  p.placement_status AS status,p.version_no AS version,
  COALESCE((SELECT floor(sum(extract(epoch FROM (l.ended_at-l.started_at))))::float8 FROM practicum.activity_log l WHERE l.placement_id=p.id AND l.ended_at IS NOT NULL AND l.voided_at IS NULL),0) AS "totalSeconds",
  (SELECT count(*)::integer FROM practicum.activity_log l WHERE l.placement_id=p.id AND l.ended_at IS NOT NULL AND l.voided_at IS NULL) AS "entryCount",
  EXISTS(SELECT 1 FROM practicum.activity_log l WHERE l.placement_id=p.id AND l.ended_at IS NULL AND l.voided_at IS NULL) AS "hasRunningTimer"`;
export const placementJoins = sql`practicum.placement p JOIN iam.account a ON a.person_id=p.student_person_id
  JOIN core.person person ON person.id=p.student_person_id`;
// Fold Spanish vowel accents so names such as Álvaro appear alongside A names.
export const placementOrderName = sql`lower(translate(concat_ws(' ',person.given_names,person.family_names), 'ÁÉÍÓÚÜÑáéíóúüñ', 'AEIOUUNaeiouun')) COLLATE "C"`;
export function placementCursor(
  cursor: string | null,
): { id: string; sortName: string } | null {
  if (cursor === null) return null;
  try {
    const value: unknown = JSON.parse(
      Buffer.from(cursor, 'base64url').toString('utf8'),
    );
    if (
      value &&
      typeof value === 'object' &&
      'id' in value &&
      typeof value.id === 'string' &&
      uuidPattern.test(value.id) &&
      'sortName' in value &&
      typeof value.sortName === 'string' &&
      value.sortName.length <= 1000
    )
      return { id: value.id, sortName: value.sortName };
  } catch {
    /* Malformed client cursors never reach SQL casts. */
  }
  throw new PracticumError('invalid_input');
}
export const taskColumns = sql`t.id,t.placement_id AS "placementId",t.title,t.project_label AS "projectLabel",t.activity_kind AS "activityKind",
  t.description,t.task_status AS status,t.version_no AS version,t.assigned_by_director AS "assignedByDirector",t.created_by_account_id AS "createdByAccountId"`;
export const entryColumns = sql`l.id,l.placement_id AS "placementId",l.task_id AS "taskId",l.task_title AS "taskTitle",l.project_label AS "projectLabel",
  l.activity_kind AS "activityKind",l.description,l.started_at::text AS "startedAt",l.ended_at::text AS "endedAt",
  CASE WHEN l.ended_at IS NULL THEN NULL ELSE floor(extract(epoch FROM (l.ended_at-l.started_at)))::float8 END AS "durationSeconds",
  l.entry_source AS source,l.version_no AS version,l.voided_at::text AS "voidedAt"`;

export function uuidCursor(query: PageQuery): string | null {
  if (query.cursor !== null && !uuidPattern.test(query.cursor))
    throw new PracticumError('invalid_input');
  return query.cursor;
}
export function entryCursor(
  cursor: string | null,
): { id: string; startedAt: string } | null {
  if (cursor === null) return null;
  try {
    const value: unknown = JSON.parse(
      Buffer.from(cursor, 'base64url').toString('utf8'),
    );
    if (
      value &&
      typeof value === 'object' &&
      'id' in value &&
      typeof value.id === 'string' &&
      uuidPattern.test(value.id) &&
      'startedAt' in value &&
      typeof value.startedAt === 'string' &&
      validDate(value.startedAt.slice(0, 10)) &&
      Number.isFinite(Date.parse(value.startedAt))
    )
      return { id: value.id, startedAt: value.startedAt };
  } catch {
    /* Invalid client cursors never reach SQL casts. */
  }
  throw new PracticumError('invalid_input');
}
export function pageOf<T extends { id: string }>(
  rows: T[],
  limit: number,
): Page<T> {
  const hasMore = rows.length > limit;
  const items = rows.slice(0, limit);
  return { items, nextCursor: hasMore ? items.at(-1)!.id : null };
}
export function entryPage(rows: TimeEntry[], limit: number): Page<TimeEntry> {
  const items = rows.slice(0, limit);
  const last = items.at(-1);
  return {
    items,
    nextCursor:
      rows.length > limit && last
        ? Buffer.from(
            JSON.stringify({ id: last.id, startedAt: last.startedAt }),
          ).toString('base64url')
        : null,
  };
}
