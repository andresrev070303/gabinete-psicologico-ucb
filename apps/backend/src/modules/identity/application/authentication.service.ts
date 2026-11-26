import { AuthenticationFailure } from './authentication.contracts.js';
import type {
  AuthenticationStore,
  PasswordVerifier,
  SessionTokenCodec,
  SignInInput,
} from './authentication.contracts.js';

export class AuthenticationService {
  private signInInProgress = false;
  constructor(
    private readonly store: AuthenticationStore,
    private readonly passwords: PasswordVerifier,
    private readonly tokens: SessionTokenCodec,
  ) {}

  authenticate(token: string) {
    const hash = this.tokens.hash(token);
    return hash ? this.store.authenticate(hash) : Promise.resolve(null);
  }

  signOut(accountId: string, sessionId: string, requestId: string) {
    return this.store.signOut(accountId, sessionId, requestId);
  }

  recordActivity(accountId: string, sessionId: string, requestId: string) {
    return this.store.touch(accountId, sessionId, requestId);
  }

  async signIn(input: SignInInput, requestId: string, previousToken?: string) {
    // One scrypt operation at a time on the 512 MB development service; no unbounded queue.
    if (this.signInInProgress) throw new AuthenticationFailure('busy');
    this.signInInProgress = true;
    try {
      const secret = this.tokens.issue();
      const result = await this.store.signIn(
        {
          email: input.email.trim().toLowerCase(),
          tokenHash: secret.hash,
          previousTokenHash: previousToken
            ? this.tokens.hash(previousToken)
            : null,
          requestId,
        },
        async (account) => {
          const valid = await this.passwords.verify(
            input.password,
            account?.passwordHash,
          );
          return (
            valid &&
            account !== null &&
            account.accountStatus === 'active' &&
            account.authMethod === 'local' &&
            account.personActive &&
            !account.mfaEnabled
          );
        },
      );
      if (result.kind !== 'success')
        throw new AuthenticationFailure(result.kind);
      return {
        identity: result.identity,
        session: result.session,
        token: secret.token,
      };
    } finally {
      this.signInInProgress = false;
    }
  }
}
