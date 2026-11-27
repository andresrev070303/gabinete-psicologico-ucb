import { sql } from 'drizzle-orm';
import type {
  AppDatabase,
  AppTransaction,
} from '../../../infrastructure/database/database.types.js';
import type { IdentityActor } from '../application/account-management.contracts.js';
import { IdentityOperationError } from '../application/account-management.contracts.js';
import type {
  AccountLifecycleStore,
  InviteOperationalInput,
  UpdateAccountInput,
  OwnSession,
  IdentityAuditEntry,
} from '../application/account-lifecycle.contracts.js';
import { canManageOperationalAccount } from '../domain/account-lifecycle.rules.js';
import type { OperationalRole } from '../domain/account-lifecycle.rules.js';
import { RoleDelegationPolicy } from '../domain/role-delegation.policy.js';
import { IdentityTransactions } from './identity-transactions.js';
import type { ActorState } from './identity-transactions.js';
import {
  lockedAccount,
  summarizeAccount,
  revokeSessions,
  revokeActions,
  recordIdentityAction,
  operationalScope,
} from './account-queries.js';
import type { AccountRow } from './account-queries.js';

export class PostgresAccountLifecycleStore implements AccountLifecycleStore {
  private readonly transactions: IdentityTransactions;
  private readonly delegation = new RoleDelegationPolicy();
  constructor(database: AppDatabase) {
    this.transactions = new IdentityTransactions(database);
  }
  private operational<T>(
    actor: IdentityActor,
    permission: string,
    work: (tx: AppTransaction, state: ActorState) => Promise<T>,
  ) {
    return this.transactions.run(
      actor,
      { permission, roles: ['director'], mutation: true },
      work,
    );
  }
  private assertOperational(actor: IdentityActor, row: AccountRow) {
    if (!canManageOperationalAccount(actor.accountId, row))
      throw new IdentityOperationError('forbidden');
  }
  private async grantRoles(
    tx: AppTransaction,
    id: string,
    roles: readonly OperationalRole[],
  ) {
    if (roles.some((role) => !this.delegation.allowsRole(role)))
      throw new IdentityOperationError('forbidden');
    for (const role of roles) {
      const inserted =
        await tx.execute(sql`INSERT INTO iam.account_role(account_id,role_id)
        SELECT ${id}::uuid,id FROM iam.role WHERE code=${role} AND active RETURNING id`);
      if (inserted.rowCount !== 1)
        throw new IdentityOperationError('invalid_state');
    }
  }
  private async action(
    tx: AppTransaction,
    actor: IdentityActor,
    row: AccountRow,
    hash: Buffer,
    purpose: string,
    reset = false,
  ) {
    await revokeActions(tx, row.accountId);
    const token = (
      await tx.execute<{
        expiresAt: string;
      }>(sql`INSERT INTO iam.account_action_token(account_id,purpose,token_hash,expires_at)
      VALUES(${row.accountId}::uuid,${purpose},${hash},clock_timestamp()+${reset ? 1 : 24}*interval '1 hour') RETURNING expires_at::text AS "expiresAt"`)
    ).rows[0];
    return {
      account: summarizeAccount(
        row,
        actor.accountId,
        purpose === 'director_activation',
      ),
      expiresAt: new Date(token.expiresAt).toISOString(),
    };
  }
  invite(actor: IdentityActor, input: InviteOperationalInput, hash: Buffer) {
    return this.operational(
      actor,
      'accounts.invite_operational',
      async (tx) => {
        const person = (
          await tx.execute<{ id: string }>(
            sql`INSERT INTO core.person(given_names,family_names) VALUES(${input.givenNames},${input.familyNames}) RETURNING id`,
          )
        ).rows[0];
        const account = (
          await tx.execute<{
            id: string;
          }>(sql`INSERT INTO iam.account(person_id,email,account_status,auth_method)
        VALUES(${person.id}::uuid,${input.email},'invited','local') RETURNING id`)
        ).rows[0];
        await this.grantRoles(tx, account.id, input.roleCodes);
        const row = await lockedAccount(tx, account.id);
        const invitation = await this.action(
          tx,
          actor,
          row,
          hash,
          'operational_activation',
        );
        await recordIdentityAction(tx, 'operational_invited', row.accountId);
        return invitation;
      },
    );
  }
  update(actor: IdentityActor, id: string, input: UpdateAccountInput) {
    return this.operational(
      actor,
      'accounts.update_operational',
      async (tx) => {
        const row = await lockedAccount(tx, id);
        this.assertOperational(actor, row);
        await tx.execute(
          sql`UPDATE core.person SET given_names=${input.givenNames},family_names=${input.familyNames},contact_phone=${input.contactPhone} WHERE id=${row.personId}::uuid`,
        );
        await recordIdentityAction(tx, 'profile_updated', id);
      },
    );
  }
  changeRoles(
    actor: IdentityActor,
    id: string,
    roles: readonly OperationalRole[],
  ) {
    return this.operational(
      actor,
      'roles.assign_operational',
      async (tx, state) => {
        const row = await lockedAccount(tx, id);
        this.assertOperational(actor, row);
        if (roles.some((role) => !this.delegation.allowsRole(role)))
          throw new IdentityOperationError('forbidden');
        if (!['active', 'invited'].includes(row.status))
          throw new IdentityOperationError('invalid_state');
        const granted = roles.filter((role) => !row.roles.includes(role));
        const revoked = row.roles.filter(
          (role) => !roles.includes(role as OperationalRole),
        );
        const principal = {
          accountId: actor.accountId,
          permissionCodes: state.permissions,
        };
        if (
          granted.some(
            (role) => !this.delegation.canAssignRole(principal, row, role),
          ) ||
          revoked.some(
            (role) => !this.delegation.canRevokeRole(principal, row, role),
          )
        )
          throw new IdentityOperationError('forbidden');
        if (!granted.length && !revoked.length) return;
        for (const role of revoked)
          await tx.execute(sql`UPDATE iam.account_role ar SET revoked_at=clock_timestamp() FROM iam.role r
        WHERE ar.role_id=r.id AND ar.account_id=${id}::uuid AND r.code=${role} AND ar.revoked_at IS NULL`);
        await this.grantRoles(tx, id, granted);
        await revokeSessions(tx, id, 'roles_changed');
        await recordIdentityAction(tx, 'roles_changed', id);
      },
    );
  }
  private lifecyclePermission(
    actor: IdentityActor,
    state: ActorState,
    row: AccountRow,
    operation: 'disable' | 'reinvite' | 'reset',
  ): 'director' | 'operational' {
    const director =
      state.roles.includes('administrator') &&
      actor.accountId !== row.accountId &&
      !row.roleHistory.includes('administrator') &&
      (row.directorCandidate || row.roleHistory.includes('director'));
    const operational =
      state.roles.includes('director') &&
      canManageOperationalAccount(actor.accountId, row);
    const permission = director
      ? operation === 'reset'
        ? 'credentials.issue_director_reset'
        : `director.${operation}`
      : operation === 'reset'
        ? 'credentials.issue_operational_reset'
        : `accounts.${operation}_operational`;
    if ((!director && !operational) || !state.permissions.includes(permission))
      throw new IdentityOperationError('forbidden');
    return director ? 'director' : 'operational';
  }
  disable(actor: IdentityActor, id: string, reason: string) {
    return this.transactions.run(
      actor,
      { roles: ['administrator', 'director'], mutation: true },
      async (tx, state) => {
        const row = await lockedAccount(tx, id);
        this.lifecyclePermission(actor, state, row, 'disable');
        if (row.status === 'disabled')
          throw new IdentityOperationError('invalid_state');
        await revokeSessions(tx, id, 'account_disabled');
        await revokeActions(tx, id);
        await tx.execute(
          sql`UPDATE iam.account_role SET revoked_at=clock_timestamp() WHERE account_id=${id}::uuid AND revoked_at IS NULL`,
        );
        await tx.execute(
          sql`UPDATE iam.account SET account_status='disabled' WHERE id=${id}::uuid`,
        );
        await recordIdentityAction(tx, 'account_disabled', id, reason);
      },
    );
  }
  reinvite(
    actor: IdentityActor,
    id: string,
    roles: readonly OperationalRole[],
    hash: Buffer,
  ) {
    return this.transactions.run(
      actor,
      { roles: ['administrator', 'director'], mutation: true },
      async (tx, state) => {
        const row = await lockedAccount(tx, id);
        const kind = this.lifecyclePermission(actor, state, row, 'reinvite');
        // Pending invitations can also be replaced after a lost or expired link.
        if (
          !['disabled', 'invited'].includes(row.status) ||
          !row.personActive ||
          (kind === 'operational' && roles.length === 0) ||
          (kind === 'director' && roles.length > 0)
        )
          throw new IdentityOperationError('invalid_state');
        await revokeSessions(tx, id, 'account_reinvited');
        await revokeActions(tx, id);
        await tx.execute(
          sql`UPDATE iam.account_role SET revoked_at=clock_timestamp() WHERE account_id=${id}::uuid AND revoked_at IS NULL`,
        );
        await tx.execute(
          sql`UPDATE iam.account SET account_status='invited',password_hash=NULL WHERE id=${id}::uuid`,
        );
        if (kind === 'operational') await this.grantRoles(tx, id, roles);
        const next = await lockedAccount(tx, id);
        const invitation = await this.action(
          tx,
          actor,
          next,
          hash,
          kind === 'director'
            ? 'director_activation'
            : 'operational_activation',
        );
        await recordIdentityAction(tx, 'account_reinvited', id);
        return invitation;
      },
    );
  }
  issueReset(actor: IdentityActor, id: string, hash: Buffer) {
    return this.transactions.run(
      actor,
      { roles: ['administrator', 'director'], mutation: true },
      async (tx, state) => {
        const row = await lockedAccount(tx, id);
        this.lifecyclePermission(actor, state, row, 'reset');
        if (row.status !== 'active' || !row.personActive)
          throw new IdentityOperationError('invalid_state');
        const action = await this.action(
          tx,
          actor,
          row,
          hash,
          'password_reset',
          true,
        );
        await recordIdentityAction(tx, 'password_reset_issued', id);
        return action;
      },
    );
  }
  sessions(actor: IdentityActor) {
    return this.transactions.run(
      actor,
      { mutation: false },
      async (tx) =>
        (
          await tx.execute<OwnSession>(sql`SELECT id,created_at::text AS "createdAt",expires_at::text AS "expiresAt",last_seen_at::text AS "lastSeenAt",id=${actor.authSessionId}::uuid AS current
        FROM iam.auth_session WHERE account_id=${actor.accountId}::uuid AND session_kind='interactive' AND revoked_at IS NULL
        AND expires_at>clock_timestamp() AND coalesce(last_seen_at,created_at)>clock_timestamp()-interval '30 minutes' ORDER BY created_at DESC,id DESC`)
        ).rows,
    );
  }
  revokeSession(actor: IdentityActor, id: string) {
    return this.transactions.run(
      actor,
      { mutation: true, recent: false },
      async (tx) => {
        const session =
          await tx.execute(sql`UPDATE iam.auth_session SET revoked_at=clock_timestamp(),revocation_reason='user_revoked'
        WHERE id=${id}::uuid AND account_id=${actor.accountId}::uuid AND session_kind='interactive' AND revoked_at IS NULL RETURNING id`);
        if (!session.rowCount) throw new IdentityOperationError('not_found');
        await recordIdentityAction(tx, 'session_revoked', actor.accountId);
      },
    );
  }
  async changePassword(
    actor: IdentityActor,
    hash: string,
    verify: (stored: string) => Promise<boolean>,
  ) {
    const changed = await this.transactions.run(
      actor,
      { mutation: true, recent: false },
      async (tx) => {
        const failures = (
          await tx.execute<{
            count: number;
          }>(sql`SELECT count(*)::integer AS count FROM audit.identity_event
        WHERE actor_account_id=${actor.accountId}::uuid AND action='password_change_failed' AND occurred_at>clock_timestamp()-interval '15 minutes'`)
        ).rows[0].count;
        if (failures >= 5) throw new IdentityOperationError('rate_limited');
        const row = (
          await tx.execute<{ hash: string }>(
            sql`SELECT password_hash AS hash FROM iam.account WHERE id=${actor.accountId}::uuid`,
          )
        ).rows[0];
        if (!(await verify(row.hash))) {
          await recordIdentityAction(
            tx,
            'password_change_failed',
            actor.accountId,
          );
          return false;
        }
        await tx.execute(
          sql`UPDATE iam.account SET password_hash=${hash} WHERE id=${actor.accountId}::uuid`,
        );
        await revokeSessions(tx, actor.accountId, 'password_changed');
        await revokeActions(tx, actor.accountId);
        await recordIdentityAction(tx, 'password_changed', actor.accountId);
        return true;
      },
    );
    if (!changed) throw new IdentityOperationError('invalid_password');
  }
  contact(actor: IdentityActor) {
    return this.transactions.run(
      actor,
      { mutation: false },
      async (tx) =>
        (
          await tx.execute<{ contactPhone: string | null }>(
            sql`SELECT p.contact_phone AS "contactPhone" FROM core.person p JOIN iam.account a ON a.person_id=p.id WHERE a.id=${actor.accountId}::uuid`,
          )
        ).rows[0],
    );
  }
  updateContact(actor: IdentityActor, phone: string | null) {
    return this.transactions.run(
      actor,
      { mutation: true, recent: false },
      async (tx) => {
        await tx.execute(
          sql`UPDATE core.person p SET contact_phone=${phone} FROM iam.account a WHERE a.person_id=p.id AND a.id=${actor.accountId}::uuid`,
        );
        await recordIdentityAction(tx, 'contact_updated', actor.accountId);
      },
    );
  }
  audit(actor: IdentityActor, page: number, pageSize: number) {
    return this.transactions.run(
      actor,
      {
        mutation: false,
        permission: 'audit.read_identity',
        roles: ['administrator', 'director'],
      },
      async (tx, state) => {
        const scope = state.roles.includes('administrator')
          ? sql`true`
          : sql`e.actor_account_id=${actor.accountId}::uuid OR a.id IS NOT NULL AND ${operationalScope(actor.accountId)}`;
        // Resolve subjects from identity tables only. Never project credential values or unrelated clinical events.
        const events = sql`WITH events AS (
        SELECT 'action:'||id::text AS id,occurred_at,action,target_account_id,actor_account_id,auth_session_id,request_id::text,ARRAY[]::text[] AS changed_fields,reason FROM audit.identity_event
        UNION ALL
        SELECT 'auth:'||id::text,occurred_at,event_type,actor_account_id,actor_account_id,auth_session_id,request_id::text,ARRAY[]::text[],NULL::text FROM audit.security_event WHERE actor_account_id IS NOT NULL
        UNION ALL
        SELECT 'change:'||e.id::text,e.occurred_at,e.operation||':'||e.schema_name||'.'||e.table_name,
          CASE WHEN e.schema_name='core' THEN (SELECT id FROM iam.account WHERE person_id=e.row_id)
            WHEN e.table_name='account' THEN e.row_id WHEN e.table_name='account_role' THEN (SELECT account_id FROM iam.account_role WHERE id=e.row_id)
            WHEN e.table_name='auth_session' THEN (SELECT account_id FROM iam.auth_session WHERE id=e.row_id)
            ELSE (SELECT account_id FROM iam.account_action_token WHERE id=e.row_id) END,
          e.actor_account_id,e.auth_session_id,e.request_id::text,e.changed_column_names,NULL::text
        FROM audit.change_event e WHERE (e.schema_name='core' AND e.table_name='person') OR (e.schema_name='iam' AND e.table_name IN ('account','account_role','auth_session','account_action_token'))
      ),visible AS (SELECT e.* FROM events e LEFT JOIN iam.account a ON a.id=e.target_account_id WHERE ${scope})`;
        const total = (
          await tx.execute<{ count: number }>(
            sql`${events} SELECT count(*)::integer AS count FROM visible`,
          )
        ).rows[0].count;
        const rows = (
          await tx.execute<IdentityAuditEntry>(sql`${events} SELECT id,occurred_at::text AS "occurredAt",action,target_account_id AS "targetAccountId",
        actor_account_id AS "actorAccountId",auth_session_id AS "sessionId",request_id AS "requestId",changed_fields AS "changedFields",reason
        FROM visible ORDER BY occurred_at DESC,id DESC LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}`)
        ).rows;
        return { items: rows, total, page, pageSize };
      },
    );
  }
}
