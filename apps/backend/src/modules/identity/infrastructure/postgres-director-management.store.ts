import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { sql } from 'drizzle-orm';
import type {
  AppDatabase,
  AppTransaction,
} from '../../../infrastructure/database/database.types.js';
import type {
  IdentityActor,
  DirectorManagementStore,
  AccountActivationStore,
  InviteDirectorInput,
  AccountSummary,
  AccountPage,
} from '../application/account-management.contracts.js';
import { IdentityOperationError } from '../application/account-management.contracts.js';
import {
  canDesignateDirector,
  requiresRecentAuthentication,
} from '../domain/director.rules.js';
import type { DirectorCandidate } from '../domain/director.rules.js';
import { canUseSession } from '../domain/session-policy.js';

type ActorState = {
  accountId: string;
  roles: string[];
  permissions: string[];
  createdAt: string;
  expiresAt: string;
  lastSeenAt: string | null;
  revokedAt: string | null;
  sessionKind: string;
  checkedAt: string;
};
type AccountRow = AccountSummary & DirectorCandidate;

export class PostgresDirectorManagementStore
  implements DirectorManagementStore, AccountActivationStore
{
  constructor(private readonly database: AppDatabase) {}
  private async safely<T>(work: () => Promise<T>): Promise<T> {
    try {
      return await work();
    } catch (error) {
      if (error instanceof IdentityOperationError) throw error;
      const cause =
        error && typeof error === 'object' && 'cause' in error
          ? error.cause
          : error;
      if (
        cause &&
        typeof cause === 'object' &&
        'code' in cause &&
        cause.code === '23505' &&
        'constraint' in cause &&
        cause.constraint === 'account_email_normalized_uq'
      )
        throw new IdentityOperationError('email_conflict');
      throw new IdentityOperationError('unavailable');
    }
  }
  private transaction<T>(
    actor: IdentityActor,
    permission: string,
    mutation: boolean,
    work: (tx: AppTransaction, actor: ActorState) => Promise<T>,
  ): Promise<T> {
    return this.safely(() =>
      this.database.transaction(async (tx) => {
        if (mutation) await this.lockGovernance(tx);
        // Lock the actor before its sessions, consistently with login and logout.
        await tx.execute(
          sql`SELECT id FROM iam.account WHERE id=${actor.accountId}::uuid FOR UPDATE`,
        );
        const state = await this.authorize(tx, actor, permission, mutation);
        await tx.execute(
          sql`SELECT audit.set_request_context(${actor.accountId}::uuid,${actor.authSessionId}::uuid,${actor.requestId}::uuid)`,
        );
        return work(tx, state);
      }),
    );
  }
  private lockGovernance(tx: AppTransaction) {
    return tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtextextended('gabinete.identity.administration',0))`,
    );
  }
  private async authorize(
    tx: AppTransaction,
    actor: IdentityActor,
    permission: string,
    recent: boolean,
  ): Promise<ActorState> {
    const result =
      await tx.execute<ActorState>(sql`SELECT a.id AS "accountId",s.created_at::text AS "createdAt",s.expires_at::text AS "expiresAt",
      s.last_seen_at::text AS "lastSeenAt",s.revoked_at::text AS "revokedAt",s.session_kind AS "sessionKind",clock_timestamp()::text AS "checkedAt",
      ARRAY(SELECT r.code FROM iam.account_role ar JOIN iam.role r ON r.id=ar.role_id WHERE ar.account_id=a.id AND ar.revoked_at IS NULL AND r.active) AS roles,
      ARRAY(SELECT permission_code FROM iam.v_effective_permission WHERE account_id=a.id) AS permissions
      FROM iam.account a JOIN core.person p ON p.id=a.person_id JOIN iam.auth_session s ON s.account_id=a.id
      WHERE a.id=${actor.accountId}::uuid AND s.id=${actor.authSessionId}::uuid AND a.account_status='active' AND p.active AND NOT a.mfa_enabled`);
    const state = result.rows[0];
    if (
      !state ||
      !canUseSession(state, Date.parse(state.checkedAt)) ||
      !state.permissions.includes(permission) ||
      !(
        state.roles.includes('administrator') ||
        (!recent && state.roles.includes('director'))
      )
    )
      throw new IdentityOperationError('forbidden');
    if (
      recent &&
      requiresRecentAuthentication(
        Date.parse(state.createdAt),
        Date.parse(state.checkedAt),
      )
    )
      throw new IdentityOperationError('reauthentication_required');
    return state;
  }
  private projection() {
    return sql`SELECT a.id AS "accountId",a.email,a.account_status AS status,p.given_names AS "givenNames",p.family_names AS "familyNames",p.active AS "personActive",
      ARRAY(SELECT r.code FROM iam.account_role ar JOIN iam.role r ON r.id=ar.role_id WHERE ar.account_id=a.id ORDER BY ar.granted_at) AS "roleHistory",
      ARRAY(SELECT r.code FROM iam.account_role ar JOIN iam.role r ON r.id=ar.role_id WHERE ar.account_id=a.id AND ar.revoked_at IS NULL AND r.active ORDER BY r.code) AS roles,
      EXISTS(SELECT 1 FROM iam.account_action_token t WHERE t.account_id=a.id AND t.purpose='director_activation' AND t.consumed_at IS NOT NULL) AS "activatedCandidate"
      FROM iam.account a JOIN core.person p ON p.id=a.person_id`;
  }
  private summary(
    row: AccountRow,
    actorId: string,
    administrator: boolean,
  ): AccountSummary {
    return {
      accountId: row.accountId,
      email: row.email,
      givenNames: row.givenNames,
      familyNames: row.familyNames,
      status: row.status,
      roles: row.roles,
      canAssignDirector:
        administrator &&
        !row.roles.includes('director') &&
        canDesignateDirector(actorId, row),
    };
  }
  list(
    actor: IdentityActor,
    page: number,
    pageSize: number,
  ): Promise<AccountPage> {
    return this.transaction(
      actor,
      'accounts.read',
      false,
      async (tx, state) => {
        const administrator = state.roles.includes('administrator');
        const scope = administrator
          ? sql`true`
          : sql`a.id<>${actor.accountId}::uuid
        AND EXISTS(SELECT 1 FROM iam.account_role ar JOIN iam.role r ON r.id=ar.role_id WHERE ar.account_id=a.id AND r.code IN ('psychologist','assistant','degree_student'))
        AND NOT EXISTS(SELECT 1 FROM iam.account_role ar JOIN iam.role r ON r.id=ar.role_id WHERE ar.account_id=a.id AND r.code IN ('administrator','director'))`;
        const rows = await tx.execute<AccountRow>(
          sql`${this.projection()} WHERE ${scope} ORDER BY a.created_at DESC,a.id DESC LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}`,
        );
        const total = await tx.execute<{ count: number }>(
          sql`SELECT count(*)::integer AS count FROM iam.account a WHERE ${scope}`,
        );
        return {
          items: rows.rows.map((row) =>
            this.summary(row, actor.accountId, administrator),
          ),
          total: total.rows[0].count,
          page,
          pageSize,
        };
      },
    );
  }
  roles(actor: IdentityActor) {
    return this.transaction(
      actor,
      'roles.read',
      false,
      async (tx) =>
        (
          await tx.execute<{ code: string; label: string }>(
            sql`SELECT code,label FROM iam.role WHERE active ORDER BY code`,
          )
        ).rows,
    );
  }
  invite(actor: IdentityActor, input: InviteDirectorInput, tokenHash: Buffer) {
    return this.transaction(
      actor,
      'accounts.invite_director_candidate',
      true,
      async (tx) => {
        const people = await tx.execute<{ id: string }>(
          sql`INSERT INTO core.person(given_names,family_names) VALUES(${input.givenNames},${input.familyNames}) RETURNING id`,
        );
        const accounts = await tx.execute<{ id: string }>(
          sql`INSERT INTO iam.account(person_id,email,account_status,auth_method) VALUES(${people.rows[0].id}::uuid,${input.email},'invited','local') RETURNING id`,
        );
        const id = accounts.rows[0].id;
        const actions = await tx.execute<{
          expiresAt: string;
        }>(sql`INSERT INTO iam.account_action_token(account_id,purpose,token_hash,expires_at)
        VALUES(${id}::uuid,'director_activation',${tokenHash},clock_timestamp()+interval '24 hours') RETURNING expires_at::text AS "expiresAt"`);
        const row = (
          await tx.execute<AccountRow>(
            sql`${this.projection()} WHERE a.id=${id}::uuid`,
          )
        ).rows[0];
        return {
          account: this.summary(row, actor.accountId, true),
          expiresAt: new Date(actions.rows[0].expiresAt).toISOString(),
        };
      },
    );
  }
  assign(actor: IdentityActor, accountId: string): Promise<void> {
    return this.transaction(actor, 'director.assign', true, async (tx) => {
      await tx.execute(sql`SELECT a.id FROM iam.account a WHERE a.id=${accountId}::uuid OR a.id IN
        (SELECT ar.account_id FROM iam.account_role ar JOIN iam.role r ON r.id=ar.role_id WHERE r.code='director' AND ar.revoked_at IS NULL)
        ORDER BY a.id FOR UPDATE`);
      const candidates = await tx.execute<AccountRow>(
        sql`${this.projection()} WHERE a.id=${accountId}::uuid FOR UPDATE OF a`,
      );
      const target = candidates.rows[0];
      if (!target) throw new IdentityOperationError('not_found');
      if (!canDesignateDirector(actor.accountId, target))
        throw new IdentityOperationError('invalid_candidate');
      if (target.roles.includes('director')) return;
      const previous = await tx.execute<{
        account_id: string;
      }>(sql`UPDATE iam.account_role ar SET revoked_at=clock_timestamp()
        FROM iam.role r WHERE ar.role_id=r.id AND r.code='director' AND ar.revoked_at IS NULL RETURNING ar.account_id`);
      const assigned = await tx.execute(
        sql`INSERT INTO iam.account_role(account_id,role_id) SELECT ${accountId}::uuid,id FROM iam.role WHERE code='director' AND active RETURNING id`,
      );
      if (assigned.rowCount !== 1)
        throw new IdentityOperationError('invalid_candidate');
      const changed = [
        accountId,
        ...previous.rows.map((row) => row.account_id),
      ];
      await tx.execute(sql`UPDATE iam.auth_session SET revoked_at=clock_timestamp(),revocation_reason='director_reassigned'
        WHERE account_id IN (${sql.join(
          changed.map((id) => sql`${id}::uuid`),
          sql`,`,
        )}) AND session_kind='interactive' AND revoked_at IS NULL`);
    });
  }
  private pending(hash: Buffer) {
    return sql`SELECT t.id,t.account_id AS "accountId" FROM iam.account_action_token t JOIN iam.account a ON a.id=t.account_id JOIN core.person p ON p.id=a.person_id
      WHERE t.token_hash=${hash} AND t.purpose='director_activation' AND t.consumed_at IS NULL AND t.revoked_at IS NULL AND t.expires_at>clock_timestamp()
        AND a.account_status='invited' AND a.auth_method='local' AND p.active AND NOT a.mfa_enabled`;
  }
  isPendingActivation(hash: Buffer): Promise<boolean> {
    return this.safely(
      async () =>
        (await this.database.execute(this.pending(hash))).rows.length === 1,
    );
  }
  activate(
    hash: Buffer,
    passwordHash: string,
    requestId: string,
  ): Promise<void> {
    return this.safely(() =>
      this.database.transaction(async (tx) => {
        await this.lockGovernance(tx);
        const token = (
          await tx.execute<{ id: string; accountId: string }>(
            sql`${this.pending(hash)} FOR UPDATE OF t,a`,
          )
        ).rows[0];
        if (!token) throw new IdentityOperationError('invalid_activation');
        const sessionId = randomUUID();
        await tx.execute(
          sql`SELECT audit.set_request_context(${token.accountId}::uuid,${sessionId}::uuid,${requestId}::uuid)`,
        );
        const closedHash = createHash('sha256')
          .update(randomBytes(32))
          .digest();
        await tx.execute(sql`WITH instant AS(SELECT clock_timestamp() AS at) INSERT INTO iam.auth_session(id,account_id,token_hash,session_kind,created_at,expires_at,revoked_at,revocation_reason)
        SELECT ${sessionId}::uuid,${token.accountId}::uuid,${closedHash},'account_activation',at,at+interval '1 second',at,'action_only' FROM instant`);
        await tx.execute(
          sql`UPDATE iam.account SET password_hash=${passwordHash},account_status='active' WHERE id=${token.accountId}::uuid`,
        );
        const consumed = await tx.execute(
          sql`UPDATE iam.account_action_token SET consumed_at=clock_timestamp(),consumed_by_session_id=${sessionId}::uuid WHERE id=${token.id}::uuid AND expires_at>clock_timestamp() RETURNING id`,
        );
        if (consumed.rowCount !== 1)
          throw new IdentityOperationError('invalid_activation');
      }),
    );
  }
}
