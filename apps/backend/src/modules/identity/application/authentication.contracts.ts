export type SignInInput = Readonly<{ email: string; password: string }>;
export type PublicIdentity = Readonly<{
  accountId: string;
  email: string;
  givenNames: string;
  familyNames: string;
  roles: readonly string[];
  permissions: readonly string[];
}>;
export type PublicSession = Readonly<{
  id: string;
  createdAt: string;
  expiresAt: string;
}>;
export type AuthenticatedIdentity = Readonly<{
  identity: PublicIdentity;
  session: PublicSession;
}>;
export type AccountCredentials = Readonly<{
  accountId: string;
  passwordHash: string | null;
  accountStatus: string;
  authMethod: string;
  personActive: boolean;
  mfaEnabled: boolean;
}>;
export type SessionSecret = Readonly<{ token: string; hash: Buffer }>;
export interface SessionTokenCodec {
  issue(): SessionSecret;
  hash(token: string): Buffer | null;
}
export interface PasswordVerifier {
  verify(password: string, hash: string | null | undefined): Promise<boolean>;
}
export type SignInRecord = Readonly<{
  email: string;
  tokenHash: Buffer;
  previousTokenHash: Buffer | null;
  requestId: string;
}>;
export type SignInResult =
  | ({ kind: 'success' } & AuthenticatedIdentity)
  | { kind: 'invalid_credentials' | 'rate_limited' };
export interface AuthenticationStore {
  signIn(
    input: SignInRecord,
    verify: (account: AccountCredentials | null) => Promise<boolean>,
  ): Promise<SignInResult>;
  authenticate(hash: Buffer): Promise<AuthenticatedIdentity | null>;
  signOut(
    accountId: string,
    sessionId: string,
    requestId: string,
  ): Promise<void>;
  touch(accountId: string, sessionId: string, requestId: string): Promise<void>;
}
export class AuthenticationFailure extends Error {
  constructor(
    readonly kind:
      'invalid_credentials' | 'rate_limited' | 'busy' | 'unavailable',
  ) {
    super(
      kind === 'invalid_credentials'
        ? 'Invalid email or password.'
        : 'Authentication is temporarily unavailable.',
    );
    this.name = 'AuthenticationFailure';
  }
}
