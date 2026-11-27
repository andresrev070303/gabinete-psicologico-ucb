import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getCurrentSession, signIn, signOut } from './auth.api';

const authenticated = {
  identity: {
    accountId: 'account',
    email: 'admin@example.test',
    givenNames: 'Test',
    familyNames: 'Admin',
    roles: ['administrator'],
    permissions: ['accounts.read'],
  },
  session: {
    id: 'session',
    createdAt: '2026-11-26T10:00:00.000Z',
    expiresAt: '2026-11-26T18:00:00.000Z',
  },
};

describe('Authentication API', () => {
  const fetchMock = vi.fn<typeof fetch>();
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('location', { origin: 'https://web.example.test' });
    vi.stubEnv('VITE_API_URL', '/api');
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it('sends credentials to the same-origin API and lets the browser manage the session cookie', async () => {
    fetchMock.mockResolvedValueOnce(Response.json(authenticated));
    await expect(
      signIn(
        { email: 'admin@example.test', password: 'exact password' },
        new AbortController().signal,
      ),
    ).resolves.toEqual(authenticated);
    const [url, options] = fetchMock.mock.calls[0]!;
    expect(String(url)).toBe('https://web.example.test/api/auth/sign-in');
    expect(options).toMatchObject({
      method: 'POST',
      credentials: 'same-origin',
      cache: 'no-store',
      body: JSON.stringify({
        email: 'admin@example.test',
        password: 'exact password',
      }),
    });
    expect(options?.headers).not.toHaveProperty('Authorization');
  });

  it('restores identity using the cookie without sending a token in the request body', async () => {
    fetchMock.mockResolvedValueOnce(Response.json(authenticated));
    await expect(
      getCurrentSession(new AbortController().signal),
    ).resolves.toEqual(authenticated);
    expect(fetchMock.mock.calls[0]![1]).toMatchObject({
      method: 'GET',
      credentials: 'same-origin',
    });
    expect(fetchMock.mock.calls[0]![1]?.body).toBeUndefined();
  });

  it('treats an expired or absent session as signed out', async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 401 }));
    await expect(
      getCurrentSession(new AbortController().signal),
    ).resolves.toBeNull();
  });

  it.each([204, 401])(
    'allows sign-out when the server returns %s',
    async (status) => {
      fetchMock.mockResolvedValueOnce(new Response(null, { status }));
      await expect(
        signOut(new AbortController().signal),
      ).resolves.toBeUndefined();
      expect(String(fetchMock.mock.calls[0]![0])).toBe(
        'https://web.example.test/api/auth/sign-out',
      );
    },
  );

  it.each([
    [401, 'El correo electrónico o la contraseña son incorrectos.'],
    [429, 'Demasiados intentos. Intenta nuevamente en 15 minutos.'],
    [503, 'El acceso no está disponible temporalmente.'],
  ])(
    'reports HTTP %s without exposing server internals',
    async (status, message) => {
      fetchMock.mockResolvedValueOnce(
        Response.json(
          { message: 'private database error' },
          { status: Number(status) },
        ),
      );
      await expect(
        signIn(
          { email: 'admin@example.test', password: 'secret' },
          new AbortController().signal,
        ),
      ).rejects.toThrow(String(message));
    },
  );

  it.each([
    null,
    {},
    { identity: {}, session: {} },
    {
      ...authenticated,
      identity: { ...authenticated.identity, permissions: [23] },
    },
  ])('rejects malformed identity responses', async (body) => {
    fetchMock.mockResolvedValueOnce(Response.json(body));
    await expect(
      getCurrentSession(new AbortController().signal),
    ).rejects.toThrow(
      'El servicio devolvió una respuesta de identidad inesperada.',
    );
  });

  it('rejects a cross-origin authentication URL before sending credentials', async () => {
    vi.stubEnv('VITE_API_URL', 'https://api.example.test');
    await expect(
      signIn(
        { email: 'admin@example.test', password: 'secret' },
        new AbortController().signal,
      ),
    ).rejects.toThrow(
      'Configura VITE_API_URL=/api para ingresar desde el mismo sitio.',
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
