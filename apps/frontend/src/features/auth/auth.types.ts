export type SignInInput = Readonly<{ email: string; password: string }>;
export type AuthenticatedIdentity = Readonly<{
  identity: Readonly<{
    accountId: string;
    email: string;
    givenNames: string;
    familyNames: string;
    roles: readonly string[];
    permissions: readonly string[];
  }>;
  session: Readonly<{ id: string; createdAt: string; expiresAt: string }>;
}>;
