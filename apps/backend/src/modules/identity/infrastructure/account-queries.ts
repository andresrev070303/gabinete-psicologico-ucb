import { sql } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';
import type { AppTransaction } from '../../../infrastructure/database/database.types.js';
import type { AccountSummary } from '../application/account-management.contracts.js';
import { IdentityOperationError } from '../application/account-management.contracts.js';
import { canDesignateDirector } from '../domain/director.rules.js';
import { canManageOperationalAccount } from '../domain/account-lifecycle.rules.js';

export type AccountRow = AccountSummary & {
  personId: string;
  personActive: boolean;
  roleHistory: string[];
  activatedCandidate: boolean;
  directorCandidate: boolean;
  contactPhone: string | null;
};
export function accountProjection() {
  return sql`SELECT a.id AS "accountId",a.person_id AS "personId",a.email,a.account_status AS status,p.given_names AS "givenNames",p.family_names AS "familyNames",p.contact_phone AS "contactPhone",p.active AS "personActive",
    ARRAY(SELECT r.code FROM iam.account_role ar JOIN iam.role r ON r.id=ar.role_id WHERE ar.account_id=a.id ORDER BY ar.granted_at) AS "roleHistory",
    ARRAY(SELECT r.code FROM iam.account_role ar JOIN iam.role r ON r.id=ar.role_id WHERE ar.account_id=a.id AND ar.revoked_at IS NULL AND r.active ORDER BY r.code) AS roles,
    EXISTS(SELECT 1 FROM iam.account_action_token t WHERE t.account_id=a.id AND t.purpose='director_activation' AND t.consumed_at IS NOT NULL) AS "activatedCandidate",
    EXISTS(SELECT 1 FROM iam.account_action_token t WHERE t.account_id=a.id AND t.purpose='director_activation') AS "directorCandidate"
    FROM iam.account a JOIN core.person p ON p.id=a.person_id`;
}
export function operationalScope(actorId: string): SQL {
  return sql`a.id<>${actorId}::uuid
    AND EXISTS(SELECT 1 FROM iam.account_role ar JOIN iam.role r ON r.id=ar.role_id WHERE ar.account_id=a.id AND r.code IN ('psychologist','assistant','degree_student'))
    AND NOT EXISTS(SELECT 1 FROM iam.account_role ar JOIN iam.role r ON r.id=ar.role_id WHERE ar.account_id=a.id AND r.code IN ('administrator','director'))`;
}
export function summarizeAccount(
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
    contactPhone: row.contactPhone,
    canAssignDirector:
      administrator &&
      !row.roles.includes('director') &&
      canDesignateDirector(actorId, row),
    managementKind:
      administrator &&
      row.accountId !== actorId &&
      !row.roleHistory.includes('administrator') &&
      (row.directorCandidate || row.roleHistory.includes('director'))
        ? 'director'
        : !administrator && canManageOperationalAccount(actorId, row)
          ? 'operational'
          : null,
  };
}
export async function lockedAccount(
  tx: AppTransaction,
  accountId: string,
): Promise<AccountRow> {
  const row = (
    await tx.execute<AccountRow>(
      sql`${accountProjection()} WHERE a.id=${accountId}::uuid FOR UPDATE OF a`,
    )
  ).rows[0];
  if (!row) throw new IdentityOperationError('not_found');
  return row;
}
export function revokeSessions(
  tx: AppTransaction,
  accountId: string,
  reason: string,
) {
  return tx.execute(sql`UPDATE iam.auth_session SET revoked_at=clock_timestamp(),revocation_reason=${reason}
    WHERE account_id=${accountId}::uuid AND session_kind='interactive' AND revoked_at IS NULL`);
}
export function revokeActions(tx: AppTransaction, accountId: string) {
  return tx.execute(sql`UPDATE iam.account_action_token SET revoked_at=clock_timestamp()
    WHERE account_id=${accountId}::uuid AND consumed_at IS NULL AND revoked_at IS NULL`);
}
export function recordIdentityAction(
  tx: AppTransaction,
  action: string,
  target: string,
  reason: string | null = null,
) {
  return tx.execute(
    sql`SELECT audit.record_identity_event(${action},${target}::uuid,${reason})`,
  );
}
