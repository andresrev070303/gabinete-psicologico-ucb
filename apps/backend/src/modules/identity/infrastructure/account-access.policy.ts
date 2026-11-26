import { Policy } from '@nestjs/authorization';
import type { PublicIdentity } from '../application/authentication.contracts.js';

@Policy()
export class AccountAccessPolicy {
  readAccounts(user: PublicIdentity | null): boolean {
    return (
      this.has(user, 'administrator', 'accounts.read') ||
      this.has(user, 'director', 'accounts.read')
    );
  }
  readRoles(user: PublicIdentity | null): boolean {
    return (
      this.has(user, 'administrator', 'roles.read') ||
      this.has(user, 'director', 'roles.read')
    );
  }
  inviteDirector(user: PublicIdentity | null): boolean {
    return this.has(
      user,
      'administrator',
      'accounts.invite_director_candidate',
    );
  }
  assignDirector(user: PublicIdentity | null): boolean {
    return this.has(user, 'administrator', 'director.assign');
  }
  private has(
    user: PublicIdentity | null,
    role: string,
    permission: string,
  ): boolean {
    return (
      !!user &&
      user.roles.includes(role) &&
      user.permissions.includes(permission)
    );
  }
}
