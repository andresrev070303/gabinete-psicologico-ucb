import type { SessionTokenCodec } from './authentication.contracts.js';
import type { AccessLinkDelivery } from './account-lifecycle.contracts.js';
import type {
  DirectorManagementStore,
  IdentityActor,
  InviteDirectorInput,
} from './account-management.contracts.js';

export class DirectorManagementService {
  constructor(
    private readonly store: DirectorManagementStore,
    private readonly tokens: SessionTokenCodec,
    private readonly delivery?: AccessLinkDelivery,
  ) {}
  list(actor: IdentityActor, page: number, pageSize: number) {
    return this.store.list(actor, page, pageSize);
  }
  roles(actor: IdentityActor) {
    return this.store.roles(actor);
  }
  assign(actor: IdentityActor, accountId: string) {
    return this.store.assign(actor, accountId);
  }
  async invite(actor: IdentityActor, input: InviteDirectorInput) {
    const secret = this.tokens.issue();
    const invitation = await this.store.invite(actor, input, secret.hash);
    // Manual test delivery returns the raw token once; Gmail keeps it private to the recipient.
    const delivery = this.delivery
      ? await this.delivery
          .deliver(invitation, secret.token, 'activation')
          .catch(() => 'failed' as const)
      : 'manual';
    return {
      ...invitation,
      ...(delivery === 'manual' ? { activationToken: secret.token } : {}),
      delivery,
    };
  }
}
