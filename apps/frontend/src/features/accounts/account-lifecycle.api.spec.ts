import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  changePassword,
  changeRoles,
  disableAccount,
  getContact,
  inviteOperational,
  issuePasswordReset,
  listIdentityAudit,
  listOwnSessions,
  reinviteAccount,
  revokeOwnSession,
  updateAccount,
  updateContact,
} from './account-lifecycle.api';
describe('Account lifecycle API', () => {
  const fetcher = vi.fn<typeof fetch>();
  const signal = new AbortController().signal;
  beforeEach(() => {
    fetcher.mockReset();
    vi.stubGlobal('fetch', fetcher);
    vi.stubGlobal('location', { origin: 'https://web.example.test' });
    vi.stubEnv('VITE_API_URL', '/api');
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });
  const input = {
    givenNames: 'Test',
    familyNames: 'User',
    email: 'test@example.test',
  };
  const invitation = {
    account: {
      ...input,
      accountId: 'account',
      status: 'invited',
      roles: ['psychologist'],
      canAssignDirector: false,
    },
    expiresAt: '2026-11-27T00:00:00Z',
    activationToken: 'A'.repeat(43),
    delivery: 'manual',
  };
  it.each(['manual', 'sent', 'failed'])(
    'retains the %s delivery outcome without retrying an invitation',
    async (delivery) => {
      fetcher.mockResolvedValueOnce(
        Response.json({
          ...invitation,
          delivery,
          activationToken:
            delivery === 'manual' ? invitation.activationToken : undefined,
        }),
      );
      expect(
        (
          await inviteOperational(
            { ...input, roleCodes: ['psychologist'] },
            signal,
          )
        ).delivery,
      ).toBe(delivery);
      expect(fetcher).toHaveBeenCalledOnce();
      expect(JSON.parse(fetcher.mock.calls[0]![1]!.body as string)).toEqual({
        ...input,
        roleCodes: ['psychologist'],
      });
    },
  );
  it('sends each explicit mutation to its own route with no client authorship', async () => {
    fetcher.mockImplementation(async () => new Response(null, { status: 204 }));
    await updateAccount(
      'a/b',
      { givenNames: 'A', familyNames: 'B', contactPhone: null },
      signal,
    );
    await changeRoles('a', ['assistant'], signal);
    await disableAccount('a', 'Practice completed', signal);
    await changePassword(
      'old private password',
      'new private password',
      signal,
    );
    await revokeOwnSession('session', signal);
    await updateContact(null, signal);
    expect(
      fetcher.mock.calls.map(([url, options]) => [
        String(url),
        options?.method,
      ]),
    ).toEqual([
      ['https://web.example.test/api/accounts/a%2Fb/profile', 'PATCH'],
      ['https://web.example.test/api/accounts/a/roles', 'PUT'],
      ['https://web.example.test/api/accounts/a/disable', 'POST'],
      ['https://web.example.test/api/auth/password-change', 'POST'],
      [
        'https://web.example.test/api/auth/sessions/session/revocations',
        'POST',
      ],
      ['https://web.example.test/api/auth/contact', 'PUT'],
    ]);
    expect(
      fetcher.mock.calls.every(
        ([, options]) => !String(options?.body).includes('sessionId'),
      ),
    ).toBe(true);
  });
  it('uses separate commands for reinvitation and password recovery', async () => {
    fetcher.mockImplementation(async () => Response.json(invitation));
    await reinviteAccount('account', ['assistant'], signal);
    await issuePasswordReset('account', signal);
    expect(String(fetcher.mock.calls[0]![0])).toContain('/reinvitations');
    expect(String(fetcher.mock.calls[1]![0])).toContain(
      '/password-reset-invitations',
    );
  });
  it('validates session, contact and scoped audit responses', async () => {
    const sessions = [
      {
        id: 'session',
        createdAt: '2026-11-26',
        expiresAt: '2026-11-27',
        lastSeenAt: null,
        current: true,
      },
    ];
    fetcher.mockResolvedValueOnce(Response.json(sessions));
    expect(await listOwnSessions(signal)).toEqual(sessions);
    fetcher.mockResolvedValueOnce(Response.json({ contactPhone: null }));
    expect(await getContact(signal)).toBeNull();
    const audit = {
      items: [
        {
          id: 'event',
          occurredAt: '2026-11-26',
          action: 'roles_changed',
          targetAccountId: 'target',
          actorAccountId: 'actor',
          sessionId: 'session',
          requestId: 'request',
          changedFields: [],
          reason: null,
        },
      ],
      total: 1,
      page: 1,
      pageSize: 20,
    };
    fetcher.mockResolvedValueOnce(Response.json(audit));
    expect(await listIdentityAudit(1, signal)).toEqual(audit);
  });
  it.each(['sessions', 'contact', 'audit'])(
    'rejects a malformed %s response',
    async (kind) => {
      fetcher.mockResolvedValueOnce(Response.json({ token: 'unexpected' }));
      await expect(
        kind === 'sessions'
          ? listOwnSessions(signal)
          : kind === 'contact'
            ? getContact(signal)
            : listIdentityAudit(1, signal),
      ).rejects.toThrow('unexpected');
    },
  );
  it('reports a throttled password change without exposing the server detail', async () => {
    fetcher.mockResolvedValueOnce(
      Response.json(
        { code: 'rate_limited', message: 'sensitive detail' },
        { status: 429 },
      ),
    );
    await expect(changePassword('old', 'new', signal)).rejects.toThrow(
      '15 minutes',
    );
  });
});
