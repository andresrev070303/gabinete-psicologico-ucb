import { sql } from 'drizzle-orm';
import type {
  AppDatabase,
  AppTransaction,
} from '../../../infrastructure/database/database.types.js';
import type { IdentityActor } from '../application/account-management.contracts.js';
import { IdentityOperationError } from '../application/account-management.contracts.js';
import { canUseSession } from '../domain/session-policy.js';
import { requiresRecentAuthentication } from '../domain/director.rules.js';

export type ActorState = {
  roles: string[];
  permissions: string[];
  createdAt: string;
  expiresAt: string;
  lastSeenAt: string | null;
  revokedAt: string | null;
  sessionKind: string;
  checkedAt: string;
};
type AccessOptions = Readonly<{
  permission?: string;
  roles?: readonly string[];
  mutation: boolean;
  recent?: boolean;
  governance?: boolean;
}>;
export async function safely<T>(work: () => Promise<T>): Promise<T> {
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
export function lockGovernance(tx: AppTransaction) {
  return tx.execute(
    sql`SELECT pg_advisory_xact_lock(hashtextextended('gabinete.identity.administration',0))`,
  );
}
export class IdentityTransactions {
  constructor(private readonly database: AppDatabase) {}
  run<T>(
    actor: IdentityActor,
    options: AccessOptions,
    work: (tx: AppTransaction, state: ActorState) => Promise<T>,
  ): Promise<T> {
    return safely(() => this.runVerified(actor, options, work));
  }
  /** Shared authenticated transaction boundary; each business module maps its own errors. */
  runVerified<T>(
    actor: IdentityActor,
    options: AccessOptions,
    work: (tx: AppTransaction, state: ActorState) => Promise<T>,
  ): Promise<T> {
    return this.database.transaction(async (tx) => {
      if (options.mutation && options.governance !== false)
        await lockGovernance(tx);
      await tx.execute(
        sql`SELECT id FROM iam.account WHERE id=${actor.accountId}::uuid FOR UPDATE`,
      );
      const state = (
        await tx.execute<ActorState>(sql`SELECT s.created_at::text AS "createdAt",s.expires_at::text AS "expiresAt",
        s.last_seen_at::text AS "lastSeenAt",s.revoked_at::text AS "revokedAt",s.session_kind AS "sessionKind",clock_timestamp()::text AS "checkedAt",
        ARRAY(SELECT r.code FROM iam.account_role ar JOIN iam.role r ON r.id=ar.role_id WHERE ar.account_id=a.id AND ar.revoked_at IS NULL AND r.active) AS roles,
        ARRAY(SELECT permission_code FROM iam.v_effective_permission WHERE account_id=a.id) AS permissions
        FROM iam.account a JOIN core.person p ON p.id=a.person_id JOIN iam.auth_session s ON s.account_id=a.id
        WHERE a.id=${actor.accountId}::uuid AND s.id=${actor.authSessionId}::uuid AND a.account_status='active' AND a.auth_method='local' AND p.active AND NOT a.mfa_enabled`)
      ).rows[0];
      if (
        !state ||
        !canUseSession(state, Date.parse(state.checkedAt)) ||
        (options.permission &&
          !state.permissions.includes(options.permission)) ||
        (options.roles &&
          !state.roles.some((role) => options.roles!.includes(role)))
      )
        throw new IdentityOperationError('forbidden');
      if (
        (options.recent ?? options.mutation) &&
        requiresRecentAuthentication(
          Date.parse(state.createdAt),
          Date.parse(state.checkedAt),
        )
      )
        throw new IdentityOperationError('reauthentication_required');
      await tx.execute(
        sql`SELECT audit.set_request_context(${actor.accountId}::uuid,${actor.authSessionId}::uuid,${actor.requestId}::uuid)`,
      );
      return work(tx, state);
    });
  }
}
