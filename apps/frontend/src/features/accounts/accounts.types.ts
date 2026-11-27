export type AccountSummary = Readonly<{
  accountId: string;
  email: string;
  givenNames: string;
  familyNames: string;
  status: string;
  roles: readonly string[];
  canAssignDirector: boolean;
  contactPhone?: string | null;
  managementKind?: 'director' | 'operational' | null;
}>;
export type AccountPage = Readonly<{
  items: readonly AccountSummary[];
  total: number;
  page: number;
  pageSize: number;
}>;
export type DirectorInvitation = Readonly<{
  account: AccountSummary;
  activationToken?: string;
  expiresAt: string;
  delivery?: 'manual' | 'sent' | 'failed';
}>;
export type OperationalRole = 'psychologist' | 'assistant' | 'degree_student';
export type OwnSession = Readonly<{
  id: string;
  createdAt: string;
  expiresAt: string;
  lastSeenAt: string | null;
  current: boolean;
}>;
export type IdentityAuditEntry = Readonly<{
  id: string;
  occurredAt: string;
  action: string;
  targetAccountId: string | null;
  actorAccountId: string | null;
  sessionId: string | null;
  requestId: string | null;
  changedFields: readonly string[];
  reason: string | null;
}>;
export type IdentityAuditPage = Readonly<{
  items: readonly IdentityAuditEntry[];
  total: number;
  page: number;
  pageSize: number;
}>;
export type InviteDirectorInput = Readonly<{
  givenNames: string;
  familyNames: string;
  email: string;
}>;
