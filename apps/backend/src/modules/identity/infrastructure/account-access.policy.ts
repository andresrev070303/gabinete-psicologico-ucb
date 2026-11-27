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
  inviteOperational(user: PublicIdentity | null) {
    return this.has(user, 'director', 'accounts.invite_operational');
  }
  updateOperational(user: PublicIdentity | null) {
    return this.has(user, 'director', 'accounts.update_operational');
  }
  manageOperationalRoles(user: PublicIdentity | null) {
    return (
      this.has(user, 'director', 'roles.assign_operational') &&
      this.has(user, 'director', 'roles.revoke_operational')
    );
  }
  disableAccount(user: PublicIdentity | null) {
    return (
      this.has(user, 'administrator', 'director.disable') ||
      this.has(user, 'director', 'accounts.disable_operational')
    );
  }
  reinviteAccount(user: PublicIdentity | null) {
    return (
      this.has(user, 'administrator', 'director.reinvite') ||
      this.has(user, 'director', 'accounts.reinvite_operational')
    );
  }
  resetAccount(user: PublicIdentity | null) {
    return (
      this.has(user, 'administrator', 'credentials.issue_director_reset') ||
      this.has(user, 'director', 'credentials.issue_operational_reset')
    );
  }
  readAudit(user: PublicIdentity | null) {
    return (
      this.has(user, 'administrator', 'audit.read_identity') ||
      this.has(user, 'director', 'audit.read_identity')
    );
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
