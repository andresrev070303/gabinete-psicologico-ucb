import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import type { AppDatabase } from '../../../infrastructure/database/database.types.js';
import {
  accountInIam,
  accountRoleInIam,
  permissionInIam,
  personInCore,
  roleInIam,
  rolePermissionInIam,
} from '../../../infrastructure/database/schema.js';
import type {
  AdministratorBootstrapStore,
  AdministratorIdentity,
  NewAdministratorRecord,
} from '../application/bootstrap-administrator.js';
import {
  IDENTITY_PERMISSIONS,
  IDENTITY_ROLES,
} from '../domain/identity-catalog.js';

/** Requires the local migration connection; the web application's role cannot run it. */
export class PostgresIdentityBootstrapStore implements AdministratorBootstrapStore {
  constructor(private readonly database: AppDatabase) {}

  createFirstAdministrator(
    input: NewAdministratorRecord,
  ): Promise<AdministratorIdentity> {
    return this.database.transaction(async (transaction) => {
      await transaction.execute(sql`
        SELECT pg_advisory_xact_lock(hashtextextended('gabinete.identity.administration', 0))
      `);
      // Also exclude manual writes that do not participate in the advisory lock.
      await transaction.execute(sql`
        LOCK TABLE iam.account, iam.role, iam.permission, iam.account_role, iam.role_permission
        IN SHARE ROW EXCLUSIVE MODE
      `);
      const existing = await transaction.execute<{ initialized: boolean }>(sql`
        SELECT EXISTS(SELECT 1 FROM iam.account)
          OR EXISTS(SELECT 1 FROM iam.role)
          OR EXISTS(SELECT 1 FROM iam.permission)
          OR EXISTS(SELECT 1 FROM iam.account_role)
          OR EXISTS(SELECT 1 FROM iam.role_permission) AS initialized
      `);
      if (existing.rows[0].initialized) {
        throw new Error(
          'Identity is already initialized. Existing data was not changed.',
        );
      }
      await transaction.execute(sql`
        SELECT audit.set_system_context('bootstrap-first-admin', ${randomUUID()}::uuid)
      `);

      const roles = await transaction
        .insert(roleInIam)
        .values(
          IDENTITY_ROLES.map(({ code, label, description }) => ({
            code,
            label,
            description,
          })),
        )
        .returning({ id: roleInIam.id, code: roleInIam.code });
      const permissions = await transaction
        .insert(permissionInIam)
        .values(
          IDENTITY_PERMISSIONS.map(({ code, description }) => ({
            code,
            description,
          })),
        )
        .returning({ id: permissionInIam.id, code: permissionInIam.code });
      const roleIds = new Map(roles.map((role) => [role.code, role.id]));
      const permissionIds = new Map(
        permissions.map((permission) => [permission.code, permission.id]),
      );
      const grants = IDENTITY_ROLES.flatMap((role) =>
        role.permissions.map((permission) => ({
          roleId: roleIds.get(role.code)!,
          permissionId: permissionIds.get(permission)!,
        })),
      );
      await transaction.insert(rolePermissionInIam).values(grants);

      const [person] = await transaction
        .insert(personInCore)
        .values({
          givenNames: input.givenNames,
          familyNames: input.familyNames,
        })
        .returning({ id: personInCore.id });
      const [account] = await transaction
        .insert(accountInIam)
        .values({
          personId: person.id,
          email: input.email,
          passwordHash: input.passwordHash,
          accountStatus: 'active',
          authMethod: 'local',
        })
        .returning({ id: accountInIam.id, email: accountInIam.email });
      await transaction.insert(accountRoleInIam).values({
        accountId: account.id,
        roleId: roleIds.get('administrator')!,
      });
      return {
        accountId: account.id,
        personId: person.id,
        email: account.email,
        roleCode: 'administrator',
      };
    });
  }
}
