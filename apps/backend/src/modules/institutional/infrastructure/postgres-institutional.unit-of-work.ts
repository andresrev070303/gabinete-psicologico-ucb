import { createHash } from 'node:crypto';
import { sql } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';
import type { AppTransaction } from '../../../infrastructure/database/database.types.js';
import { PostgresNotificationWriter } from '../../notifications/infrastructure/postgres-notification.writer.js';
import type { InstitutionalIdentity } from '../domain/institutional.rules.js';
import { InstitutionalError } from '../domain/institutional.rules.js';
import type {
  InstitutionalUnitOfWork,
  RecordKey,
  RecordDraft,
  NewRecord,
  RecordChange,
  StatusChange,
  ListQuery,
  RecordSummary,
  RecordDetails,
  TeamMember,
  InstitutionOption,
} from '../application/institutional.contracts.js';
import {
  definitions,
  recordTable,
  recordRows,
  recordColumns,
  recordJoins,
  scope,
  cursorValue,
} from './institutional.queries.js';

export class PostgresInstitutionalUnitOfWork implements InstitutionalUnitOfWork {
  constructor(
    private readonly tx: AppTransaction,
    readonly identity: InstitutionalIdentity & { accountId: string },
    readonly now: string,
    private readonly notifications: PostgresNotificationWriter,
  ) {}
  async list(query: ListQuery) {
    const cursor = cursorValue(query.cursor);
    const pattern = `%${query.search.replaceAll('\\', '\\\\').replaceAll('%', '\\%').replaceAll('_', '\\_')}%`;
    const rows = (
      await this.tx
        .execute<RecordSummary>(sql`WITH records AS (${recordRows}) SELECT ${recordColumns} FROM ${recordJoins} WHERE r.deleted_at IS NULL AND ${scope(this.identity)}
      ${query.type ? sql`AND r.type=${query.type}` : sql``}
      ${query.status ? sql`AND r.status=${query.status}` : sql``}
      ${query.search ? sql`AND (r.title ILIKE ${pattern} OR i.name ILIKE ${pattern})` : sql``}
      ${query.from ? sql`AND (r."endsAt" IS NULL OR (CASE WHEN r.kind='activity' THEN (r."endsAt"::timestamptz AT TIME ZONE 'America/La_Paz')::date ELSE r."endsAt"::date END)>=${query.from}::date)` : sql``}
      ${query.to ? sql`AND (CASE WHEN r.kind='activity' THEN (r."startsAt"::timestamptz AT TIME ZONE 'America/La_Paz')::date ELSE r."startsAt"::date END)<=${query.to}::date` : sql``}
      ${cursor ? sql`AND (r."createdAt"::timestamptz,r.id,r.kind)<(${cursor.createdAt}::timestamptz,${cursor.id}::uuid,${cursor.kind}::text)` : sql``}
      ORDER BY r."createdAt"::timestamptz DESC,r.id DESC,r.kind DESC LIMIT ${query.limit + 1}`)
    ).rows;
    const items = rows.slice(0, query.limit),
      last = items.at(-1);
    return {
      items,
      nextCursor:
        rows.length > query.limit && last
          ? Buffer.from(
              JSON.stringify({
                id: last.id,
                kind: last.kind,
                createdAt: last.createdAt,
              }),
            ).toString('base64url')
          : null,
    };
  }
  async details(key: RecordKey, lock = false): Promise<RecordDetails> {
    if (lock)
      await this.tx.execute(
        sql`SELECT id FROM ${recordTable(key.kind)} WHERE id=${key.id}::uuid FOR UPDATE`,
      );
    const record = (
      await this.tx.execute<RecordSummary>(
        sql`WITH records AS (${recordRows}) SELECT ${recordColumns} FROM ${recordJoins} WHERE r.id=${key.id}::uuid AND r.kind=${key.kind} AND r.deleted_at IS NULL AND ${scope(this.identity)}`,
      )
    ).rows[0];
    if (!record) throw new InstitutionalError('not_found');
    const memberColumn = sql.identifier(definitions[key.kind].member);
    const team = (
      await this.tx
        .execute<TeamMember>(sql`SELECT a.id AS "accountId",concat_ws(' ',p.given_names,p.family_names) AS name,ARRAY(SELECT role.code FROM iam.account_role ar JOIN iam.role role ON role.id=ar.role_id WHERE ar.account_id=a.id AND ar.revoked_at IS NULL AND role.active) AS roles
      FROM projects.institutional_team team JOIN iam.account a ON a.id=team.account_id JOIN core.person p ON p.id=a.person_id WHERE team.${memberColumn}=${key.id}::uuid AND team.removed_at IS NULL ORDER BY lower(p.family_names),lower(p.given_names),a.id`)
    ).rows;
    const related =
      key.kind === 'activity'
        ? []
        : (
            await this.tx.execute<RecordSummary>(
              sql`WITH records AS (${recordRows}) SELECT ${recordColumns} FROM ${recordJoins} WHERE r.kind='activity' AND r.deleted_at IS NULL AND ${key.kind === 'project' ? sql`r."projectId"=${key.id}::uuid` : sql`r."agreementId"=${key.id}::uuid`} AND ${scope(this.identity)} ORDER BY r."startsAt"::timestamptz DESC,r.id DESC LIMIT 100`,
            )
          ).rows;
    return { record, team, related };
  }
  async catalog() {
    const institutions = (
      await this.tx.execute<InstitutionOption>(
        sql`SELECT id,name,kind FROM core.institution WHERE active ORDER BY lower(name),id`,
      )
    ).rows;
    const people = (
      await this.tx.execute<TeamMember>(
        sql`SELECT a.id AS "accountId",concat_ws(' ',p.given_names,p.family_names) AS name,ARRAY(SELECT r.code FROM iam.account_role ar JOIN iam.role r ON r.id=ar.role_id WHERE ar.account_id=a.id AND ar.revoked_at IS NULL AND r.active) AS roles FROM iam.account a JOIN core.person p ON p.id=a.person_id WHERE a.account_status='active' AND p.active AND EXISTS(SELECT 1 FROM iam.account_role ar JOIN iam.role r ON r.id=ar.role_id WHERE ar.account_id=a.id AND ar.revoked_at IS NULL AND r.active AND r.code IN ('director','psychologist','assistant','degree_student')) ORDER BY lower(p.family_names),lower(p.given_names),a.id`,
      )
    ).rows;
    const options = (
      await this.tx.execute<RecordSummary>(
        sql`WITH records AS (${recordRows}) SELECT ${recordColumns} FROM ${recordJoins} WHERE r.kind IN ('project','agreement') AND r.deleted_at IS NULL ORDER BY lower(r.title),r.id`,
      )
    ).rows;
    return {
      institutions,
      people,
      projects: options.filter((record) => record.kind === 'project'),
      agreements: options.filter((record) => record.kind === 'agreement'),
    };
  }
  async validateReferences(input: RecordDraft): Promise<void> {
    const ids = [
      ...new Set([...input.memberAccountIds, input.responsibleAccountId]),
    ];
    const eligible = (
      await this.tx.execute<{
        id: string;
        responsible: boolean;
      }>(sql`SELECT a.id,EXISTS(SELECT 1 FROM iam.account_role ar JOIN iam.role r ON r.id=ar.role_id WHERE ar.account_id=a.id AND ar.revoked_at IS NULL AND r.active AND r.code IN ('director','psychologist')) AS responsible
      FROM iam.account a JOIN core.person p ON p.id=a.person_id WHERE a.id IN (${sql.join(
        ids.map((id) => sql`${id}::uuid`),
        sql`,`,
      )}) AND a.account_status='active' AND p.active AND EXISTS(SELECT 1 FROM iam.account_role ar JOIN iam.role r ON r.id=ar.role_id WHERE ar.account_id=a.id AND ar.revoked_at IS NULL AND r.active AND r.code IN ('director','psychologist','assistant','degree_student'))`)
    ).rows;
    if (
      eligible.length !== ids.length ||
      !eligible.find((person) => person.id === input.responsibleAccountId)
        ?.responsible
    )
      throw new InstitutionalError('invalid_reference');
    if (
      input.institutionId &&
      !(
        await this.tx.execute(
          sql`SELECT id FROM core.institution WHERE id=${input.institutionId}::uuid AND active FOR SHARE`,
        )
      ).rows.length
    )
      throw new InstitutionalError('invalid_reference');
    if (
      input.projectId &&
      !(
        await this.tx.execute(
          sql`SELECT id FROM projects.project WHERE id=${input.projectId}::uuid AND deleted_at IS NULL FOR SHARE`,
        )
      ).rows.length
    )
      throw new InstitutionalError('invalid_reference');
    if (input.agreementId) {
      const agreement = (
        await this.tx.execute<{ institutionId: string }>(
          sql`SELECT institution_id AS "institutionId" FROM projects.agreement WHERE id=${input.agreementId}::uuid AND deleted_at IS NULL FOR SHARE`,
        )
      ).rows[0];
      if (
        !agreement ||
        (input.institutionId && input.institutionId !== agreement.institutionId)
      )
        throw new InstitutionalError('invalid_reference');
    }
  }
  private values(input: RecordDraft): Readonly<Record<string, SQL>> {
    const definition = definitions[input.kind];
    const values: Record<string, SQL> = {
      [definition.title]: sql`${input.title}`,
      summary: sql`${input.description}`,
      [definition.start]:
        input.kind === 'activity'
          ? sql`${input.startsAt}::timestamptz`
          : sql`${input.startsAt}::date`,
      [definition.end]:
        input.kind === 'activity'
          ? sql`${input.endsAt}::timestamptz`
          : sql`${input.endsAt}::date`,
      institution_id: input.agreementId
        ? sql`COALESCE(${input.institutionId}::uuid,(SELECT institution_id FROM projects.agreement WHERE id=${input.agreementId}::uuid))`
        : sql`${input.institutionId}::uuid`,
      responsible_account_id: sql`${input.responsibleAccountId}::uuid`,
    };
    if (input.kind === 'activity')
      Object.assign(values, {
        activity_kind: sql`${input.type}`,
        project_id: sql`${input.projectId}::uuid`,
        agreement_id: sql`${input.agreementId}::uuid`,
        venue: sql`${input.venue}`,
      });
    if (input.kind === 'agreement') values.agreement_code = sql`${input.code}`;
    if (input.kind === 'project')
      Object.assign(values, {
        project_kind: sql`'program'`,
        project_code: sql`${input.code}`,
      });
    return values;
  }
  async create(input: NewRecord): Promise<RecordDetails> {
    await this.tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtextextended(${`institutional:${input.id}`},0))`,
    );
    const fingerprint = createHash('sha256')
      .update(
        JSON.stringify({
          ...input,
          memberAccountIds: [...input.memberAccountIds].sort(),
        }),
      )
      .digest('hex');
    const existing = (
      await this.tx.execute<{ fingerprint: string | null }>(
        sql`SELECT request_fingerprint AS fingerprint FROM ${recordTable(input.kind)} WHERE id=${input.id}::uuid`,
      )
    ).rows[0];
    if (existing) {
      if (existing.fingerprint !== fingerprint)
        throw new InstitutionalError('duplicate');
      return this.details(input);
    }
    const values = {
      id: sql`${input.id}::uuid`,
      ...this.values(input),
      request_fingerprint: sql`${fingerprint}`,
    };
    await this.tx.execute(
      sql`INSERT INTO ${recordTable(input.kind)} (${sql.join(
        Object.keys(values).map((key) => sql.identifier(key)),
        sql`,`,
      )}) VALUES (${sql.join(Object.values(values), sql`,`)})`,
    );
    await this.synchronizeTeam(input, input);
    return this.details(input);
  }
  async update(key: RecordKey, input: RecordChange): Promise<RecordDetails> {
    if (key.kind === 'agreement') {
      const conflicting = (
        await this.tx.execute(
          sql`SELECT id FROM projects.activity WHERE agreement_id=${key.id}::uuid AND deleted_at IS NULL AND institution_id IS DISTINCT FROM ${input.institutionId}::uuid LIMIT 1`,
        )
      ).rows.length;
      if (conflicting) throw new InstitutionalError('linked_records');
    }
    const sets = Object.entries(this.values(input)).map(
      ([column, value]) => sql`${sql.identifier(column)}=${value}`,
    );
    await this.tx.execute(
      sql`UPDATE ${recordTable(key.kind)} SET ${sql.join(sets, sql`,`)},change_reason='Institutional details updated' WHERE id=${key.id}::uuid AND version_no=${input.version}`,
    );
    await this.synchronizeTeam(key, input);
    return this.details(key);
  }
  async synchronizeTeam(key: RecordKey, input: RecordDraft): Promise<void> {
    const column = sql.identifier(definitions[key.kind].member);
    const ids = [
      ...new Set([...input.memberAccountIds, input.responsibleAccountId]),
    ].sort();
    await this.tx.execute(
      sql`UPDATE projects.institutional_team SET removed_at=clock_timestamp() WHERE ${column}=${key.id}::uuid AND removed_at IS NULL AND account_id NOT IN (${sql.join(
        ids.map((id) => sql`${id}::uuid`),
        sql`,`,
      )})`,
    );
    for (const accountId of ids) {
      const assignment = (
        await this.tx.execute<{ id: string }>(
          sql`INSERT INTO projects.institutional_team(${column},account_id) SELECT ${key.id}::uuid,${accountId}::uuid WHERE NOT EXISTS(SELECT 1 FROM projects.institutional_team WHERE ${column}=${key.id}::uuid AND account_id=${accountId}::uuid AND removed_at IS NULL) RETURNING id`,
        )
      ).rows[0];
      if (assignment)
        await this.notifications.enqueue(this.tx, {
          recipientAccountId: accountId,
          senderAccountId: this.identity.accountId,
          eventKey: assignment.id,
          resourceKind: key.kind,
          resourceId: key.id,
          resourceTitle: input.title,
          resourceType: input.type,
        });
    }
  }
  async changeStatus(
    key: RecordKey,
    input: StatusChange,
  ): Promise<RecordDetails> {
    await this.tx
      .execute(sql`UPDATE ${recordTable(key.kind)} SET ${sql.identifier(definitions[key.kind].status)}=${input.status},change_reason=${input.reason}
      ${key.kind === 'activity' ? sql`,results=${input.results},reported_participants=${input.reportedParticipants}` : sql``} WHERE id=${key.id}::uuid AND version_no=${input.version}`);
    return this.details(key);
  }
  async archive(
    key: RecordKey,
    version: number,
    reason: string,
  ): Promise<void> {
    if (key.kind !== 'activity') {
      const linked = await this.tx.execute(
        sql`SELECT id FROM projects.activity WHERE ${sql.identifier(definitions[key.kind].member)}=${key.id}::uuid AND deleted_at IS NULL LIMIT 1`,
      );
      if (linked.rows.length) throw new InstitutionalError('linked_records');
    }
    await this.tx.execute(
      sql`UPDATE ${recordTable(key.kind)} SET deleted_at=clock_timestamp(),change_reason=${reason} WHERE id=${key.id}::uuid AND version_no=${version}`,
    );
    await this.tx.execute(
      sql`UPDATE projects.institutional_team SET removed_at=clock_timestamp() WHERE ${sql.identifier(definitions[key.kind].member)}=${key.id}::uuid AND removed_at IS NULL`,
    );
  }
  async createInstitution(input: {
    id: string;
    name: string;
    kind: string;
  }): Promise<InstitutionOption> {
    const existing = (
      await this.tx.execute<InstitutionOption>(
        sql`SELECT id,name,kind FROM core.institution WHERE id=${input.id}::uuid`,
      )
    ).rows[0];
    if (existing) {
      if (existing.name !== input.name || existing.kind !== input.kind)
        throw new InstitutionalError('duplicate');
      return existing;
    }
    await this.tx.execute(
      sql`INSERT INTO core.institution(id,name,kind) VALUES(${input.id}::uuid,${input.name},${input.kind})`,
    );
    return input;
  }
}
