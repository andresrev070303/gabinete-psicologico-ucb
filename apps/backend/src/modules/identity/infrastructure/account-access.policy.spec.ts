import { AccountAccessPolicy } from './account-access.policy.js';
import type { PublicIdentity } from '../application/authentication.contracts.js';

describe('AccountAccessPolicy', () => {
  const policy = new AccountAccessPolicy();
  const user = (roles: string[], permissions: string[]): PublicIdentity => ({
    accountId: 'account',
    givenNames: 'Test',
    familyNames: 'User',
    email: 'test@example.test',
    roles,
    permissions,
  });
  it('requires explicit permission as well as the administrative role', () => {
    expect(
      policy.inviteDirector(
        user(['administrator'], ['accounts.invite_director_candidate']),
      ),
    ).toBe(true);
    expect(
      policy.assignDirector(user(['administrator'], ['director.assign'])),
    ).toBe(true);
    expect(policy.assignDirector(user(['administrator'], []))).toBe(false);
    expect(policy.assignDirector(user(['director'], ['director.assign']))).toBe(
      false,
    );
    expect(policy.inviteDirector(null)).toBe(false);
  });
  it('allows catalog queries only for the roles and permissions in the matrix', () => {
    expect(policy.readRoles(user(['director'], ['roles.read']))).toBe(true);
    expect(policy.readAccounts(user(['director'], ['accounts.read']))).toBe(
      true,
    );
    expect(policy.readAccounts(user(['psychologist'], ['accounts.read']))).toBe(
      false,
    );
    expect(policy.readRoles(user(['administrator'], []))).toBe(false);
  });
});
