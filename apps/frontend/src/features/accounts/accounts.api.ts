import { apiRequest } from '../../lib/api-client';
import type {
  AccountPage,
  AccountSummary,
  DirectorInvitation,
  InviteDirectorInput,
} from './accounts.types';

export function record(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}
function account(value: unknown): value is AccountSummary {
  return (
    record(value) &&
    ['accountId', 'email', 'givenNames', 'familyNames', 'status'].every(
      (key) => typeof value[key] === 'string',
    ) &&
    Array.isArray(value.roles) &&
    value.roles.every((role: unknown) => typeof role === 'string') &&
    typeof value.canAssignDirector === 'boolean'
  );
}
export async function check(response: Response): Promise<void> {
  if (response.ok) return;
  if (response.status === 401)
    throw new Error('Your session has expired. Sign out and sign in again.');
  if (response.status === 503)
    throw new Error(
      'Account management is temporarily unavailable. Try again.',
    );
  const body: unknown = await response.json().catch(() => null);
  const messages: Record<string, string> = {
    reauthentication_required:
      'Sign out and sign in again before changing account access.',
    email_conflict: 'An account already uses this email address.',
    invalid_candidate: 'Select an activated director candidate.',
    invalid_activation:
      'The activation link is invalid, expired or already used.',
    invalid_state:
      'This operation is not available for the current account state.',
    invalid_password: 'The current password is incorrect.',
    rate_limited: 'Too many attempts. Try again in 15 minutes.',
  };
  if (
    record(body) &&
    typeof body.code === 'string' &&
    Object.hasOwn(messages, body.code)
  )
    throw new Error(messages[body.code]);
  throw new Error(`The operation was rejected (HTTP ${response.status}).`);
}
export async function listAccounts(
  page: number,
  signal: AbortSignal,
): Promise<AccountPage> {
  const response = await apiRequest(
    `accounts?page=${page}&pageSize=20`,
    { method: 'GET' },
    signal,
  );
  await check(response);
  const body: unknown = await response.json();
  if (
    !record(body) ||
    !Array.isArray(body.items) ||
    !body.items.every(account) ||
    !Number.isInteger(body.total) ||
    !Number.isInteger(body.page) ||
    !Number.isInteger(body.pageSize)
  )
    throw new Error('The API returned an unexpected account list.');
  return body as AccountPage;
}
export async function inviteDirector(
  input: InviteDirectorInput,
  signal: AbortSignal,
): Promise<DirectorInvitation> {
  return createAccessLink('accounts/director-invitations', input, signal);
}
function validInvitationToken(body: Record<string, unknown>): boolean {
  if (body.delivery === 'sent' || body.delivery === 'failed')
    return body.activationToken === undefined;
  return (
    typeof body.activationToken === 'string' &&
    /^[A-Za-z0-9_-]{43}$/u.test(body.activationToken)
  );
}
export async function createAccessLink(
  path: string,
  input: unknown,
  signal: AbortSignal,
): Promise<DirectorInvitation> {
  const response = await apiRequest(
    path,
    { method: 'POST', body: JSON.stringify(input) },
    signal,
  );
  await check(response);
  const body: unknown = await response.json();
  if (
    !record(body) ||
    !account(body.account) ||
    !validInvitationToken(body) ||
    typeof body.expiresAt !== 'string' ||
    !Number.isFinite(Date.parse(body.expiresAt)) ||
    (body.delivery !== undefined &&
      !['manual', 'sent', 'failed'].includes(String(body.delivery)))
  )
    throw new Error('The API returned an unexpected invitation.');
  return body as DirectorInvitation;
}
export async function assignDirector(
  accountId: string,
  signal: AbortSignal,
): Promise<void> {
  await check(
    await apiRequest(
      `accounts/${encodeURIComponent(accountId)}/director-assignment`,
      { method: 'POST' },
      signal,
    ),
  );
}
export async function activateAccount(
  token: string,
  password: string,
  signal: AbortSignal,
): Promise<void> {
  await check(
    await apiRequest(
      'auth/activations',
      { method: 'POST', body: JSON.stringify({ token, password }) },
      signal,
    ),
  );
}
