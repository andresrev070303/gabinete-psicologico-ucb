import { canUseSession, SESSION_POLICY } from './session-policy.js';

describe('session eligibility', () => {
  const now = Date.parse('2026-11-26T12:00:00Z');
  const session = {
    createdAt: new Date(now - 60000).toISOString(),
    expiresAt: new Date(now + 60000).toISOString(),
    lastSeenAt: null,
    revokedAt: null,
    sessionKind: 'interactive',
  };
  it('accepts an active interactive session', () =>
    expect(canUseSession(session, now)).toBe(true));
  it.each([
    { ...session, expiresAt: new Date(now).toISOString() },
    { ...session, revokedAt: new Date(now).toISOString() },
    {
      ...session,
      createdAt: new Date(now - SESSION_POLICY.idleMs).toISOString(),
    },
    {
      ...session,
      lastSeenAt: new Date(now - SESSION_POLICY.idleMs).toISOString(),
    },
    { ...session, sessionKind: 'account_activation' },
    { ...session, sessionKind: 'password_reset' },
    { ...session, expiresAt: 'invalid' },
  ])(
    'rejects expired, idle, revoked or action-only credentials',
    (candidate) => {
      expect(canUseSession(candidate, now)).toBe(false);
    },
  );
});
