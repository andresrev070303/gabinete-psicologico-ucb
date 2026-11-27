import type { DatabaseHealth } from './health.types';
import { getApiEndpoint } from '../../lib/api-url';

const REQUEST_TIMEOUT_MS = 90_000;

function isDatabaseHealth(value: unknown): value is DatabaseHealth {
  return (
    typeof value === 'object' &&
    value !== null &&
    'status' in value &&
    value.status === 'ok' &&
    'database' in value &&
    value.database === 'connected'
  );
}

export async function checkDatabaseHealth(
  signal: AbortSignal,
): Promise<DatabaseHealth> {
  const endpoint = getApiEndpoint('health/database');
  const requestSignal = AbortSignal.any([
    signal,
    AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  ]);

  const response = await fetch(endpoint, {
    method: 'GET',
    headers: { Accept: 'application/json' },
    credentials: 'omit',
    cache: 'no-store',
    signal: requestSignal,
  });

  if (!response.ok) {
    throw new Error(`El servicio respondió con HTTP ${response.status}.`);
  }

  const data: unknown = await response.json();

  if (!isDatabaseHealth(data)) {
    throw new Error('El servicio devolvió una respuesta inesperada.');
  }

  return data;
}
