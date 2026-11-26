import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  activateAccount,
  assignDirector,
  inviteDirector,
  listAccounts,
} from './accounts.api';
import { captureActivationToken } from './activation-link';

const account = {
  accountId: 'candidate',
  email: 'candidate@example.test',
  givenNames: 'Test',
  familyNames: 'Candidate',
  status: 'invited',
  roles: [],
  canAssignDirector: false,
};
describe('Account management API', () => {
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
  it('loads a bounded page through the same-origin authenticated client', async () => {
    const page = { items: [account], page: 1, pageSize: 20, total: 1 };
    fetchMock.mockResolvedValueOnce(Response.json(page));
    expect(await listAccounts(1, new AbortController().signal)).toEqual(page);
    expect(String(fetchMock.mock.calls[0]![0])).toBe(
      'https://web.example.test/api/accounts?page=1&pageSize=20',
    );
    expect(fetchMock.mock.calls[0]![1]).toMatchObject({
      credentials: 'same-origin',
      cache: 'no-store',
    });
  });
  it('receives a private invitation only from its creation response', async () => {
    const invited = {
      account,
      activationToken: 'A'.repeat(43),
      expiresAt: '2026-11-27T10:00:00Z',
    };
    fetchMock.mockResolvedValueOnce(Response.json(invited));
    expect(
      await inviteDirector(
        { givenNames: 'Test', familyNames: 'Candidate', email: account.email },
        new AbortController().signal,
      ),
    ).toEqual(invited);
    expect(String(fetchMock.mock.calls[0]![0])).toContain(
      '/accounts/director-invitations',
    );
  });
  it('posts a one-use activation credential in the body and never in the URL', async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));
    await activateAccount(
      'private-token',
      'long testing passphrase',
      new AbortController().signal,
    );
    const [url, options] = fetchMock.mock.calls[0]!;
    expect(String(url)).toBe('https://web.example.test/api/auth/activations');
    expect(options?.body).toBe(
      JSON.stringify({
        token: 'private-token',
        password: 'long testing passphrase',
      }),
    );
  });
  it('designates through an explicit operation', async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));
    await assignDirector('candidate', new AbortController().signal);
    expect(String(fetchMock.mock.calls[0]![0])).toContain(
      '/accounts/candidate/director-assignment',
    );
  });
  it.each([
    [403, 'reauthentication_required', 'Sign out and sign in again'],
    [409, 'email_conflict', 'already uses'],
    [400, 'invalid_activation', 'invalid, expired or already used'],
    [503, 'unavailable', 'temporarily unavailable'],
    [401, 'unauthenticated', 'session has expired'],
  ])('explains HTTP %s safely', async (status, code, message) => {
    fetchMock.mockResolvedValueOnce(
      Response.json(
        { code, message: 'private internal detail' },
        { status: Number(status) },
      ),
    );
    await expect(listAccounts(1, new AbortController().signal)).rejects.toThrow(
      String(message),
    );
  });
  it.each([
    {},
    { items: [{ ...account, roles: [23] }], total: 1, page: 1, pageSize: 20 },
  ])('rejects malformed account lists', async (body) => {
    fetchMock.mockResolvedValueOnce(Response.json(body));
    await expect(listAccounts(1, new AbortController().signal)).rejects.toThrow(
      'unexpected account list',
    );
  });
  it('removes the activation fragment before the app mounts without making a request', () => {
    const history = { replaceState: vi.fn() };
    expect(
      captureActivationToken(
        { hash: '#activate=private-token', pathname: '/', search: '' },
        history,
      ),
    ).toBe('private-token');
    expect(history.replaceState).toHaveBeenCalledExactlyOnceWith(null, '', '/');
    expect(fetchMock).not.toHaveBeenCalled();
    expect(
      captureActivationToken({ hash: '', pathname: '/', search: '' }, history),
    ).toBeNull();
  });
});
