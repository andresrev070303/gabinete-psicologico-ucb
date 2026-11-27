import { apiRequest } from '../../lib/api-client';
import { check, createAccessLink, record } from './accounts.api';
import type {
  InviteDirectorInput,
  OperationalRole,
  OwnSession,
  IdentityAuditPage,
} from './accounts.types';
export function inviteOperational(
  input: InviteDirectorInput & { roleCodes: readonly OperationalRole[] },
  signal: AbortSignal,
) {
  return createAccessLink('accounts/operational-invitations', input, signal);
}
async function command(
  path: string,
  method: string,
  body: unknown,
  signal: AbortSignal,
) {
  await check(
    await apiRequest(
      path,
      { method, ...(body === undefined ? {} : { body: JSON.stringify(body) }) },
      signal,
    ),
  );
}
export function updateAccount(
  id: string,
  input: {
    givenNames: string;
    familyNames: string;
    contactPhone: string | null;
  },
  signal: AbortSignal,
) {
  return command(
    `accounts/${encodeURIComponent(id)}/profile`,
    'PATCH',
    input,
    signal,
  );
}
export function changeRoles(
  id: string,
  roleCodes: readonly OperationalRole[],
  signal: AbortSignal,
) {
  return command(
    `accounts/${encodeURIComponent(id)}/roles`,
    'PUT',
    { roleCodes },
    signal,
  );
}
export function disableAccount(
  id: string,
  reason: string,
  signal: AbortSignal,
) {
  return command(
    `accounts/${encodeURIComponent(id)}/disable`,
    'POST',
    { reason },
    signal,
  );
}
export function reinviteAccount(
  id: string,
  roleCodes: readonly OperationalRole[],
  signal: AbortSignal,
) {
  return createAccessLink(
    `accounts/${encodeURIComponent(id)}/reinvitations`,
    { roleCodes },
    signal,
  );
}
export function issuePasswordReset(id: string, signal: AbortSignal) {
  return createAccessLink(
    `accounts/${encodeURIComponent(id)}/password-reset-invitations`,
    {},
    signal,
  );
}
export function changePassword(
  currentPassword: string,
  newPassword: string,
  signal: AbortSignal,
) {
  return command(
    'auth/password-change',
    'POST',
    { currentPassword, newPassword },
    signal,
  );
}
export async function listOwnSessions(
  signal: AbortSignal,
): Promise<readonly OwnSession[]> {
  const response = await apiRequest('auth/sessions', { method: 'GET' }, signal);
  await check(response);
  const body: unknown = await response.json();
  if (
    !Array.isArray(body) ||
    !body.every(
      (item: unknown) =>
        record(item) &&
        typeof item.id === 'string' &&
        typeof item.createdAt === 'string' &&
        typeof item.expiresAt === 'string' &&
        (item.lastSeenAt === null || typeof item.lastSeenAt === 'string') &&
        typeof item.current === 'boolean',
    )
  )
    throw new Error('The API returned an unexpected session list.');
  return body as OwnSession[];
}
export function revokeOwnSession(id: string, signal: AbortSignal) {
  return command(
    `auth/sessions/${encodeURIComponent(id)}/revocations`,
    'POST',
    undefined,
    signal,
  );
}
export async function getContact(signal: AbortSignal): Promise<string | null> {
  const response = await apiRequest('auth/contact', { method: 'GET' }, signal);
  await check(response);
  const body: unknown = await response.json();
  if (
    !record(body) ||
    (body.contactPhone !== null && typeof body.contactPhone !== 'string')
  )
    throw new Error('The API returned unexpected contact data.');
  return body.contactPhone;
}
export function updateContact(
  contactPhone: string | null,
  signal: AbortSignal,
) {
  return command('auth/contact', 'PUT', { contactPhone }, signal);
}
export async function listIdentityAudit(
  page: number,
  signal: AbortSignal,
): Promise<IdentityAuditPage> {
  const response = await apiRequest(
    `identity-audit?page=${page}&pageSize=20`,
    { method: 'GET' },
    signal,
  );
  await check(response);
  const body: unknown = await response.json();
  if (
    !record(body) ||
    !Number.isInteger(body.total) ||
    !Number.isInteger(body.page) ||
    !Number.isInteger(body.pageSize) ||
    !Array.isArray(body.items) ||
    !body.items.every(
      (item: unknown) =>
        record(item) &&
        ['id', 'occurredAt', 'action'].every(
          (key) => typeof item[key] === 'string',
        ) &&
        [
          'targetAccountId',
          'actorAccountId',
          'sessionId',
          'requestId',
          'reason',
        ].every((key) => item[key] === null || typeof item[key] === 'string') &&
        Array.isArray(item.changedFields) &&
        item.changedFields.every((field: unknown) => typeof field === 'string'),
    )
  )
    throw new Error('The API returned an unexpected audit list.');
  return body as IdentityAuditPage;
}
