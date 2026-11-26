import type { AuditContext } from '../../../infrastructure/database/audited-transaction.js';
export type IdentityActor = AuditContext;
export type InviteDirectorInput = Readonly<{
  givenNames: string;
  familyNames: string;
  email: string;
}>;
export type ActivateAccountInput = Readonly<{
  token: string;
  password: string;
}>;
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
export type RoleSummary = Readonly<{ code: string; label: string }>;
export interface DirectorManagementStore {
  list(
    actor: IdentityActor,
    page: number,
    pageSize: number,
  ): Promise<AccountPage>;
  roles(actor: IdentityActor): Promise<readonly RoleSummary[]>;
  invite(
    actor: IdentityActor,
    input: InviteDirectorInput,
    tokenHash: Buffer,
  ): Promise<{ account: AccountSummary; expiresAt: string }>;
  assign(actor: IdentityActor, accountId: string): Promise<void>;
}
export interface AccountActivationStore {
  isPendingActivation(tokenHash: Buffer): Promise<boolean>;
  activate(
    tokenHash: Buffer,
    passwordHash: string,
    requestId: string,
  ): Promise<void>;
}
export class IdentityOperationError extends Error {
  constructor(
    readonly kind:
      | 'forbidden'
      | 'not_found'
      | 'email_conflict'
      | 'invalid_candidate'
      | 'invalid_activation'
      | 'reauthentication_required'
      | 'unavailable',
  ) {
    const messages = {
      forbidden: 'You are not allowed to perform this operation.',
      not_found: 'Account not found.',
      email_conflict: 'An account already uses this email address.',
      invalid_candidate:
        'Select an activated director candidate without incompatible role history.',
      invalid_activation:
        'The activation link is invalid, expired or already used.',
      reauthentication_required:
        'Sign out and sign in again before changing account access.',
      unavailable: 'Account management is temporarily unavailable.',
    };
    super(messages[kind]);
    this.name = 'IdentityOperationError';
  }
}
