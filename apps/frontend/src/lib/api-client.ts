import { getApiEndpoint } from './api-url';

export function apiRequest(
  path: string,
  options: RequestInit,
  signal: AbortSignal,
): Promise<Response> {
  const endpoint = getApiEndpoint(path);
  if (endpoint.origin !== globalThis.location.origin)
    throw new Error(
      'Authentication requires a same-origin API. Set VITE_API_URL=/api.',
    );
  return fetch(endpoint, {
    ...options,
    credentials: 'same-origin',
    cache: 'no-store',
    headers: {
      Accept: 'application/json',
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...options.headers,
    },
    signal: AbortSignal.any([signal, AbortSignal.timeout(90_000)]),
  });
}
