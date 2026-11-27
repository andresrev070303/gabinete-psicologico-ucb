import type {
  PasswordVerifier,
  SessionTokenCodec,
} from './authentication.contracts.js';
import type { PasswordHashGenerator } from './bootstrap-administrator.js';
import type { IdentityActor } from './account-management.contracts.js';
import type {
  AccountLifecycleStore,
  AccessLinkDelivery,
  AccountAction,
  InviteOperationalInput,
  UpdateAccountInput,
} from './account-lifecycle.contracts.js';
import type { OperationalRole } from '../domain/account-lifecycle.rules.js';
import { PasswordWorkLimiter } from './password-work-limiter.js';

export class AccountLifecycleService {
  constructor(
    private readonly store: AccountLifecycleStore,
    private readonly tokens: SessionTokenCodec,
    private readonly delivery: AccessLinkDelivery,
    private readonly passwords: PasswordHashGenerator & PasswordVerifier,
    private readonly limiter: PasswordWorkLimiter,
  ) {}
  private async link(
    work: (hash: Buffer) => Promise<AccountAction>,
    purpose: 'activation' | 'password_reset',
  ) {
    const secret = this.tokens.issue();
    const action = await work(secret.hash);
    // Delivery starts after commit. A provider failure never pretends the account was rolled back.
    const delivery = await this.delivery
      .deliver(action, secret.token, purpose)
      .catch(() => 'failed' as const);
    return {
      ...action,
      ...(delivery === 'manual' ? { activationToken: secret.token } : {}),
      delivery,
    };
  }
  invite(actor: IdentityActor, input: InviteOperationalInput) {
    return this.link(
      (hash) => this.store.invite(actor, input, hash),
      'activation',
    );
  }
  reinvite(
    actor: IdentityActor,
    id: string,
    roles: readonly OperationalRole[],
  ) {
    return this.link(
      (hash) => this.store.reinvite(actor, id, roles, hash),
      'activation',
    );
  }
  issueReset(actor: IdentityActor, id: string) {
    return this.link(
      (hash) => this.store.issueReset(actor, id, hash),
      'password_reset',
    );
  }
  update(actor: IdentityActor, id: string, input: UpdateAccountInput) {
    return this.store.update(actor, id, input);
  }
  changeRoles(
    actor: IdentityActor,
    id: string,
    roles: readonly OperationalRole[],
  ) {
    return this.store.changeRoles(actor, id, roles);
  }
  disable(actor: IdentityActor, id: string, reason: string) {
    return this.store.disable(actor, id, reason);
  }
  sessions(actor: IdentityActor) {
    return this.store.sessions(actor);
  }
  revokeSession(actor: IdentityActor, id: string) {
    return this.store.revokeSession(actor, id);
  }
  contact(actor: IdentityActor) {
    return this.store.contact(actor);
  }
  updateContact(actor: IdentityActor, phone: string | null) {
    return this.store.updateContact(actor, phone);
  }
  audit(actor: IdentityActor, page: number, pageSize: number) {
    return this.store.audit(actor, page, pageSize);
  }
  changePassword(actor: IdentityActor, current: string, next: string) {
    return this.limiter.run(async () => {
      const hash = await this.passwords.hash(next);
      return this.store.changePassword(actor, hash, (stored) =>
        this.passwords.verify(current, stored),
      );
    });
  }
}
