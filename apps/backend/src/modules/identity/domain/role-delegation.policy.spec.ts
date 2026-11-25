import { describe, expect, it } from 'vitest';
import { RoleDelegationPolicy } from './role-delegation.policy.js';
import type { RoleAssignmentActor, RoleAssignmentTarget } from './role-delegation.policy.js';

describe('RoleDelegationPolicy', () => {
  const policy = new RoleDelegationPolicy();

  it.each(['psychologist', 'assistant', 'degree_student'])(
    'allows the operational role %s',
    (role) => expect(policy.allowsRole(role)).toBe(true),
  );

  it.each(['administrator', 'director', 'unknown_role', ''])(
    'rejects the non-delegable role %s',
    (role) => expect(policy.allowsRole(role)).toBe(false),
  );

  describe.each([
    { operation: 'assign', permission: 'roles.assign_operational', other: 'roles.revoke_operational' },
    { operation: 'revoke', permission: 'roles.revoke_operational', other: 'roles.assign_operational' },
  ] as const)('$operation', ({ operation, permission, other }) => {
    const actor: RoleAssignmentActor = { accountId: 'director-account', permissionCodes: [permission] };
    const target: RoleAssignmentTarget = { accountId: 'staff-account', roleHistory: ['psychologist'] };
    const permits = (who: RoleAssignmentActor, account: RoleAssignmentTarget, role = 'assistant') =>
      operation === 'assign'
        ? policy.canAssignRole(who, account, role)
        : policy.canRevokeRole(who, account, role);

    it.each(['psychologist', 'assistant', 'degree_student'])(
      'allows changing the operational role %s',
      (role) => expect(permits(actor, target, role)).toBe(true),
    );

    it('requires the permission for this specific operation', () => {
      expect(permits({ ...actor, permissionCodes: [other] }, target)).toBe(false);
    });

    it('rejects an actor without permissions', () => {
      expect(permits({ ...actor, permissionCodes: [] }, target)).toBe(false);
    });

    it('does not substitute the invitation permission', () => {
      expect(permits({ ...actor, permissionCodes: ['accounts.invite_operational'] }, target)).toBe(false);
    });

    it('rejects changes to the actor own account', () => {
      expect(permits(actor, { ...target, accountId: actor.accountId })).toBe(false);
    });

    it.each(['administrator', 'director'])(
      'protects accounts with historical role %s',
      (role) => expect(permits(actor, { ...target, roleHistory: ['psychologist', role] })).toBe(false),
    );

    it.each([{ roleHistory: [] }, { roleHistory: ['unknown_role'] }])('requires operational history $roleHistory', ({ roleHistory }) => {
      expect(permits(actor, { ...target, roleHistory })).toBe(false);
    });

    it.each(['administrator', 'director', 'unknown_role', ''])(
      'rejects changing the role %s',
      (role) => expect(permits(actor, target, role)).toBe(false),
    );

    it('keeps formerly operational accounts within scope', () => {
      expect(permits(actor, { ...target, roleHistory: ['degree_student'] })).toBe(true);
    });
  });
});
