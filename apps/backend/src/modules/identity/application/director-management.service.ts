import type { SessionTokenCodec } from './authentication.contracts.js';
import type {
  DirectorManagementStore,
  IdentityActor,
  InviteDirectorInput,
} from './account-management.contracts.js';

export class DirectorManagementService {
  constructor(
    private readonly store: DirectorManagementStore,
    private readonly tokens: SessionTokenCodec,
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
    // The raw token is returned once after commit and is never persisted or logged.
    return { ...invitation, activationToken: secret.token };
  }
}
