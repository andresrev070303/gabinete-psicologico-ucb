import { sql } from 'drizzle-orm';
import type {
  RecordKind,
  InstitutionalIdentity,
} from '../domain/institutional.rules.js';
import {
  canManageInstitutional,
  InstitutionalError,
} from '../domain/institutional.rules.js';
export const definitions = {
  activity: {
    table: 'activity',
    title: 'title',
    status: 'activity_status',
    start: 'starts_at',
    end: 'ends_at',
    member: 'activity_id',
  },
  agreement: {
    table: 'agreement',
    title: 'title',
    status: 'agreement_status',
    start: 'starts_on',
    end: 'ends_on',
    member: 'agreement_id',
  },
  project: {
    table: 'project',
    title: 'name',
    status: 'project_status',
    start: 'starts_on',
    end: 'ends_on',
    member: 'project_id',
  },
} as const;
export const recordTable = (kind: RecordKind) =>
  sql`${sql.identifier('projects')}.${sql.identifier(definitions[kind].table)}`;
export const recordRows = sql`
  SELECT id,'activity'::text AS kind,activity_kind::text AS type,title,summary AS description,starts_at::text AS "startsAt",ends_at::text AS "endsAt",activity_status::text AS status,institution_id AS "institutionId",responsible_account_id AS "responsibleAccountId",project_id AS "projectId",agreement_id AS "agreementId",NULL::text AS code,venue,results,reported_participants AS "reportedParticipants",version_no AS version,created_at::text AS "createdAt",deleted_at FROM projects.activity
  UNION ALL
  SELECT id,'agreement','agreement',title,summary,starts_on::text,ends_on::text,CASE WHEN agreement_status='active' AND ends_on<(clock_timestamp() AT TIME ZONE 'America/La_Paz')::date THEN 'expired' ELSE agreement_status END,institution_id,responsible_account_id,NULL::uuid,NULL::uuid,agreement_code,NULL::text,NULL::text,NULL::integer,version_no,created_at::text,deleted_at FROM projects.agreement
  UNION ALL
  SELECT id,'project','program',name,summary,starts_on::text,ends_on::text,project_status,institution_id,responsible_account_id,NULL::uuid,NULL::uuid,project_code,NULL::text,NULL::text,NULL::integer,version_no,created_at::text,deleted_at FROM projects.project`;
export const recordColumns = sql`r.id,r.kind,r.type,r.title,r.description,r."startsAt",r."endsAt",r.status,r."institutionId",i.name AS "institutionName",r."responsibleAccountId",concat_ws(' ',person.given_names,person.family_names) AS "responsibleName",r."projectId",project.name AS "projectName",r."agreementId",agreement.title AS "agreementName",r.code,r.venue,r.results,r."reportedParticipants",r.version,r."createdAt"`;
export const recordJoins = sql`records r LEFT JOIN core.institution i ON i.id=r."institutionId" LEFT JOIN iam.account owner ON owner.id=r."responsibleAccountId" LEFT JOIN core.person person ON person.id=owner.person_id LEFT JOIN projects.project project ON project.id=r."projectId" LEFT JOIN projects.agreement agreement ON agreement.id=r."agreementId"`;
export function scope(identity: InstitutionalIdentity & { accountId: string }) {
  return canManageInstitutional(identity)
    ? sql`true`
    : sql`EXISTS(SELECT 1 FROM projects.institutional_team team WHERE team.account_id=${identity.accountId}::uuid AND team.removed_at IS NULL AND ((r.kind='activity' AND team.activity_id=r.id) OR (r.kind='agreement' AND team.agreement_id=r.id) OR (r.kind='project' AND team.project_id=r.id)))`;
}
export function cursorValue(
  cursor: string | null,
): { id: string; kind: RecordKind; createdAt: string } | null {
  if (!cursor) return null;
  try {
    const value: unknown = JSON.parse(
      Buffer.from(cursor, 'base64url').toString(),
    );
    if (
      !value ||
      typeof value !== 'object' ||
      !('id' in value) ||
      !('kind' in value) ||
      !('createdAt' in value) ||
      typeof value.id !== 'string' ||
      !/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/iu.test(value.id) ||
      !['activity', 'agreement', 'project'].includes(String(value.kind)) ||
      typeof value.createdAt !== 'string' ||
      !Number.isFinite(Date.parse(value.createdAt))
    )
      throw Error();
    return {
      id: value.id,
      kind: value.kind as RecordKind,
      createdAt: value.createdAt,
    };
  } catch {
    throw new InstitutionalError('invalid_input');
  }
}
