import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { checkDatabaseHealth } from './health.api';

describe('checkDatabaseHealth', () => {
  const fetchMock = vi.fn<typeof fetch>();
  const healthy = { status: 'ok', database: 'connected' };

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
    vi.stubEnv('VITE_API_URL', 'https://api.example.test/');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it.each([
    ['https://api.example.test', 'https://api.example.test/health/database'],
    ['https://api.example.test///', 'https://api.example.test/health/database'],
    [
      '  https://api.example.test/api///  ',
      'https://api.example.test/api/health/database',
    ],
  ])('requests the health endpoint for %s', async (baseUrl, expectedUrl) => {
    vi.stubEnv('VITE_API_URL', baseUrl);
    fetchMock.mockResolvedValueOnce(Response.json(healthy));
    const controller = new AbortController();

    await expect(checkDatabaseHealth(controller.signal)).resolves.toEqual(
      healthy,
    );

    const [url, options] = fetchMock.mock.calls[0]!;
    expect(String(url)).toBe(expectedUrl);
    expect(options).toMatchObject({
      method: 'GET',
      credentials: 'omit',
      cache: 'no-store',
    });
    controller.abort();
    expect(options?.signal?.aborted).toBe(true);
  });

  it.each([undefined, '', '  '])(
    'rejects an absent API URL: %s',
    async (baseUrl) => {
      vi.stubEnv('VITE_API_URL', baseUrl);

      await expect(
        checkDatabaseHealth(new AbortController().signal),
      ).rejects.toThrow('VITE_API_URL is required.');
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );

  it('supports the same-origin API proxy used by authentication', async () => {
    vi.stubGlobal('location', { origin: 'https://web.example.test' });
    vi.stubEnv('VITE_API_URL', '/api');
    fetchMock.mockResolvedValueOnce(Response.json(healthy));
    await checkDatabaseHealth(new AbortController().signal);
    expect(String(fetchMock.mock.calls[0]![0])).toBe(
      'https://web.example.test/api/health/database',
    );
  });

  it.each(['invalid-url', '////'])(
    'rejects a malformed API URL: %s',
    async (baseUrl) => {
      vi.stubEnv('VITE_API_URL', baseUrl);

      await expect(
        checkDatabaseHealth(new AbortController().signal),
      ).rejects.toThrow('VITE_API_URL must be a valid URL.');
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );

  it('rejects a protocol other than HTTP or HTTPS', async () => {
    vi.stubEnv('VITE_API_URL', 'ftp://api.example.test');

    await expect(
      checkDatabaseHealth(new AbortController().signal),
    ).rejects.toThrow('VITE_API_URL must use HTTP or HTTPS.');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('reports an unsuccessful HTTP response', async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 503 }));

    await expect(
      checkDatabaseHealth(new AbortController().signal),
    ).rejects.toThrow('The API returned HTTP 503.');
  });

  it.each([
    null,
    false,
    'healthy',
    [],
    {},
    { status: 'error', database: 'connected' },
    { status: 'ok' },
    { status: 'ok', database: 'disconnected' },
  ])('rejects an unexpected response body: %j', async (body) => {
    fetchMock.mockResolvedValueOnce(Response.json(body));

    await expect(
      checkDatabaseHealth(new AbortController().signal),
    ).rejects.toThrow('The API returned an unexpected response.');
  });

  it('propagates an invalid JSON response', async () => {
    fetchMock.mockResolvedValueOnce(new Response('invalid JSON'));

    await expect(
      checkDatabaseHealth(new AbortController().signal),
    ).rejects.toBeInstanceOf(SyntaxError);
  });

  it('propagates a network failure', async () => {
    const failure = new TypeError('Network request failed');
    fetchMock.mockRejectedValueOnce(failure);

    await expect(
      checkDatabaseHealth(new AbortController().signal),
    ).rejects.toBe(failure);
  });
});
