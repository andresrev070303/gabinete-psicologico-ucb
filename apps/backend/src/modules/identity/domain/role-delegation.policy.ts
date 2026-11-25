export type RoleAssignmentActor = Readonly<{
  accountId: string;
  permissionCodes: readonly string[];
}>;

export type RoleAssignmentTarget = Readonly<{
  accountId: string;
  /** Includes revoked assignments: protected accounts remain protected. */
  roleHistory: readonly string[];
}>;

export class RoleDelegationPolicy {
  private readonly operationalRoles: ReadonlySet<string> = new Set([
    'psychologist',
    'assistant',
    'degree_student',
  ]);

  allowsRole(roleCode: string): boolean {
    return this.operationalRoles.has(roleCode);
  }

  canAssignRole(
    actor: RoleAssignmentActor,
    target: RoleAssignmentTarget,
    roleCode: string,
  ): boolean {
    return this.canChangeRole(actor, target, roleCode, 'roles.assign_operational');
  }

  canRevokeRole(
    actor: RoleAssignmentActor,
    target: RoleAssignmentTarget,
    roleCode: string,
  ): boolean {
    return this.canChangeRole(actor, target, roleCode, 'roles.revoke_operational');
  }

  private canChangeRole(
    actor: RoleAssignmentActor,
    target: RoleAssignmentTarget,
    roleCode: string,
    requiredPermission: string,
  ): boolean {
    return (
      actor.permissionCodes.includes(requiredPermission) &&
      actor.accountId !== target.accountId &&
      this.allowsRole(roleCode) &&
      target.roleHistory.some((code) => this.allowsRole(code)) &&
      !target.roleHistory.some(
        (code) => code === 'administrator' || code === 'director',
      )
    );
  }
}
