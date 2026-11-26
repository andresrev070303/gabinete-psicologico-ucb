export type AccountSummary = Readonly<{
  accountId: string;
  email: string;
  givenNames: string;
  familyNames: string;
  status: string;
  roles: readonly string[];
  canAssignDirector: boolean;
}>;
export type AccountPage = Readonly<{
  items: readonly AccountSummary[];
  total: number;
  page: number;
  pageSize: number;
}>;
export type DirectorInvitation = Readonly<{
  account: AccountSummary;
  activationToken: string;
  expiresAt: string;
}>;
export type InviteDirectorInput = Readonly<{
  givenNames: string;
  familyNames: string;
  email: string;
}>;
