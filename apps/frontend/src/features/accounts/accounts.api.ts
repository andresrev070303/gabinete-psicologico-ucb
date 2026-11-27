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
    throw new Error('Tu sesión venció. Cierra sesión e ingresa nuevamente.');
  if (response.status === 503)
    throw new Error(
      'La gestión de cuentas no está disponible temporalmente. Intenta nuevamente.',
    );
  const body: unknown = await response.json().catch(() => null);
  const messages: Record<string, string> = {
    reauthentication_required:
      'Para cambiar accesos, cierra sesión e ingresa nuevamente.',
    email_conflict: 'Ya existe una cuenta con este correo electrónico.',
    invalid_candidate:
      'Selecciona un candidato a Director con la cuenta activada.',
    invalid_activation:
      'El enlace de activación es inválido, venció o ya fue utilizado.',
    invalid_state:
      'Esta operación no está disponible para el estado actual de la cuenta.',
    invalid_password: 'La contraseña actual es incorrecta.',
    rate_limited: 'Demasiados intentos. Intenta nuevamente en 15 minutos.',
  };
  if (
    record(body) &&
    typeof body.code === 'string' &&
    Object.hasOwn(messages, body.code)
  )
    throw new Error(messages[body.code]);
  throw new Error(`La operación fue rechazada (HTTP ${response.status}).`);
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
    throw new Error('El servicio devolvió una lista de cuentas inesperada.');
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
    throw new Error('El servicio devolvió una invitación inesperada.');
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
