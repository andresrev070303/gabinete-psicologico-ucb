import type { DatabaseHealth } from './health.types';

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

function getHealthEndpoint(): URL {
  const apiBaseUrl = import.meta.env.VITE_API_URL;

  if (typeof apiBaseUrl !== 'string' || !apiBaseUrl.trim()) {
    throw new Error('VITE_API_URL is required.');
  }

  let endpoint: URL;

  try {
    const baseUrl = `${apiBaseUrl.trim().replace(/\/+$/, '')}/`;
    endpoint = new URL('health/database', baseUrl);
  } catch {
    throw new Error('VITE_API_URL must be a valid URL.');
  }

  if (!['http:', 'https:'].includes(endpoint.protocol)) {
    throw new Error('VITE_API_URL must use HTTP or HTTPS.');
  }

  return endpoint;
}

export async function checkDatabaseHealth(
  signal: AbortSignal,
): Promise<DatabaseHealth> {
  const endpoint = getHealthEndpoint();
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
    throw new Error(`The API returned HTTP ${response.status}.`);
  }

  const data: unknown = await response.json();

  if (!isDatabaseHealth(data)) {
    throw new Error('The API returned an unexpected response.');
  }

  return data;
}
