import type {
  IdentityActor,
  InviteDirectorInput,
  AccountSummary,
} from './account-management.contracts.js';
import type { OperationalRole } from '../domain/account-lifecycle.rules.js';
export type InviteOperationalInput = InviteDirectorInput &
  Readonly<{ roleCodes: readonly OperationalRole[] }>;
export type UpdateAccountInput = Readonly<{
  givenNames: string;
  familyNames: string;
  contactPhone: string | null;
}>;
export type AccountAction = Readonly<{
  account: AccountSummary;
  expiresAt: string;
}>;
export type AccessLink = AccountAction &
  Readonly<{
    activationToken?: string;
    delivery: 'manual' | 'sent' | 'failed';
  }>;
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
export interface AccountLifecycleStore {
  invite(
    actor: IdentityActor,
    input: InviteOperationalInput,
    hash: Buffer,
  ): Promise<AccountAction>;
  update(
    actor: IdentityActor,
    accountId: string,
    input: UpdateAccountInput,
  ): Promise<void>;
  changeRoles(
    actor: IdentityActor,
    accountId: string,
    roles: readonly OperationalRole[],
  ): Promise<void>;
  disable(
    actor: IdentityActor,
    accountId: string,
    reason: string,
  ): Promise<void>;
  reinvite(
    actor: IdentityActor,
    accountId: string,
    roles: readonly OperationalRole[],
    hash: Buffer,
  ): Promise<AccountAction>;
  issueReset(
    actor: IdentityActor,
    accountId: string,
    hash: Buffer,
  ): Promise<AccountAction>;
  sessions(actor: IdentityActor): Promise<readonly OwnSession[]>;
  revokeSession(actor: IdentityActor, sessionId: string): Promise<void>;
  changePassword(
    actor: IdentityActor,
    passwordHash: string,
    verify: (storedHash: string) => Promise<boolean>,
  ): Promise<void>;
  contact(actor: IdentityActor): Promise<{ contactPhone: string | null }>;
  updateContact(actor: IdentityActor, phone: string | null): Promise<void>;
  audit(
    actor: IdentityActor,
    page: number,
    pageSize: number,
  ): Promise<IdentityAuditPage>;
}
export interface AccessLinkDelivery {
  deliver(
    action: AccountAction,
    token: string,
    purpose: 'activation' | 'password_reset',
  ): Promise<'manual' | 'sent' | 'failed'>;
}
