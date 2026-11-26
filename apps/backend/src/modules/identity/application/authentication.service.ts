import { AuthenticationFailure } from './authentication.contracts.js';
import { PasswordWorkLimiter } from './password-work-limiter.js';
import type {
  AuthenticationStore,
  PasswordVerifier,
  SessionTokenCodec,
  SignInInput,
} from './authentication.contracts.js';

export class AuthenticationService {
  constructor(
    private readonly store: AuthenticationStore,
    private readonly passwords: PasswordVerifier,
    private readonly tokens: SessionTokenCodec,
    private readonly limiter = new PasswordWorkLimiter(),
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
    return this.limiter.run(async () => {
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
    });
  }
}
