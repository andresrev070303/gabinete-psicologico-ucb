import { getApiEndpoint } from '../../lib/api-url';
import type { AuthenticatedIdentity, SignInInput } from './auth.types';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function isStringArray(value: unknown): value is string[] {
  return (
    Array.isArray(value) &&
    value.every((item: unknown) => typeof item === 'string')
  );
}
function isIdentity(value: unknown): value is AuthenticatedIdentity {
  if (!isRecord(value) || !isRecord(value.identity) || !isRecord(value.session))
    return false;
  const { identity, session } = value;
  return (
    ['accountId', 'email', 'givenNames', 'familyNames'].every(
      (key) => typeof identity[key] === 'string',
    ) &&
    isStringArray(identity.roles) &&
    isStringArray(identity.permissions) &&
    typeof session.id === 'string' &&
    typeof session.createdAt === 'string' &&
    Number.isFinite(Date.parse(session.createdAt)) &&
    typeof session.expiresAt === 'string' &&
    Number.isFinite(Date.parse(session.expiresAt))
  );
}

async function send(
  path: string,
  method: 'GET' | 'POST',
  signal: AbortSignal,
  input?: SignInInput,
): Promise<Response> {
  const endpoint = getApiEndpoint(`auth/${path}`);
  if (endpoint.origin !== globalThis.location.origin) {
    throw new Error(
      'Authentication requires a same-origin API. Set VITE_API_URL=/api.',
    );
  }
  return fetch(endpoint, {
    method,
    credentials: 'same-origin',
    cache: 'no-store',
    headers: {
      Accept: 'application/json',
      ...(input ? { 'Content-Type': 'application/json' } : {}),
    },
    body: input ? JSON.stringify(input) : undefined,
    signal: AbortSignal.any([signal, AbortSignal.timeout(90_000)]),
  });
}
function checkStatus(response: Response): void {
  if (response.ok) return;
  if (response.status === 401) throw new Error('Invalid email or password.');
  if (response.status === 429)
    throw new Error('Too many attempts. Try again in 15 minutes.');
  if (response.status === 503)
    throw new Error('Authentication is temporarily unavailable.');
  throw new Error(`Authentication failed (HTTP ${response.status}).`);
}
async function readIdentity(
  response: Response,
): Promise<AuthenticatedIdentity> {
  checkStatus(response);
  const value: unknown = await response.json();
  if (!isIdentity(value))
    throw new Error('The API returned an unexpected identity response.');
  return value;
}

export async function getCurrentSession(
  signal: AbortSignal,
): Promise<AuthenticatedIdentity | null> {
  const response = await send('me', 'GET', signal);
  return response.status === 401 ? null : readIdentity(response);
}
export async function signIn(
  input: SignInInput,
  signal: AbortSignal,
): Promise<AuthenticatedIdentity> {
  return readIdentity(await send('sign-in', 'POST', signal, input));
}
export async function signOut(signal: AbortSignal): Promise<void> {
  const response = await send('sign-out', 'POST', signal);
  if (response.status !== 401) checkStatus(response);
}
