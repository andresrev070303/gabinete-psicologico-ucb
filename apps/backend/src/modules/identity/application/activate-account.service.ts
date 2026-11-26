import type { PasswordHashGenerator } from './bootstrap-administrator.js';
import type { SessionTokenCodec } from './authentication.contracts.js';
import { IdentityOperationError } from './account-management.contracts.js';
import type {
  AccountActivationStore,
  ActivateAccountInput,
} from './account-management.contracts.js';
import { PasswordWorkLimiter } from './password-work-limiter.js';

export class ActivateAccountService {
  constructor(
    private readonly store: AccountActivationStore,
    private readonly passwords: PasswordHashGenerator,
    private readonly tokens: SessionTokenCodec,
    private readonly limiter: PasswordWorkLimiter,
  ) {}
  activate(input: ActivateAccountInput, requestId: string): Promise<void> {
    return this.limiter.run(async () => {
      const hash = this.tokens.hash(input.token);
      if (!hash || !(await this.store.isPendingActivation(hash)))
        throw new IdentityOperationError('invalid_activation');
      const passwordHash = await this.passwords.hash(input.password);
      // Persistence locks and validates the token again, then consumes it atomically.
      await this.store.activate(hash, passwordHash, requestId);
    });
  }
}
