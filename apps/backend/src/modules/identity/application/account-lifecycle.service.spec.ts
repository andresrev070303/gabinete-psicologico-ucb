import { AccountLifecycleService } from './account-lifecycle.service.js';
import { PasswordWorkLimiter } from './password-work-limiter.js';
import { SessionTokens } from '../infrastructure/session-tokens.js';
import type { AccountLifecycleStore } from './account-lifecycle.contracts.js';

describe('AccountLifecycleService delivery boundary', () => {
  it.each(['manual', 'sent', 'failed'] as const)(
    'returns the committed invitation and %s delivery state',
    async (state) => {
      const events: string[] = [];
      const action = { account: { accountId: 'target' }, expiresAt: 'expiry' };
      const invite = vi.fn().mockImplementation(async () => {
        events.push('commit');
        return action;
      });
      const deliver = vi.fn().mockImplementation(async () => {
        events.push('delivery');
        return state;
      });
      const service = new AccountLifecycleService(
        { invite } as unknown as AccountLifecycleStore,
        new SessionTokens(),
        { deliver },
        { hash: vi.fn(), verify: vi.fn() },
        new PasswordWorkLimiter(),
      );
      const result = await service.invite(
        { accountId: 'actor', authSessionId: 'session', requestId: 'request' },
        {
          givenNames: 'Test',
          familyNames: 'User',
          email: 'user@example.test',
          roleCodes: ['psychologist'],
        },
      );
      expect(events).toEqual(['commit', 'delivery']);
      expect(invite.mock.calls[0][2]).toHaveLength(32);
      if (state === 'manual')
        expect(result.activationToken).toMatch(/^[A-Za-z0-9_-]{43}$/u);
      else expect(result).not.toHaveProperty('activationToken');
      expect(result.delivery).toBe(state);
    },
  );
  it('does not contact the provider if persistence rejects the invitation', async () => {
    const deliver = vi.fn();
    const service = new AccountLifecycleService(
      {
        invite: vi.fn().mockRejectedValue(new Error('rollback')),
      } as unknown as AccountLifecycleStore,
      new SessionTokens(),
      { deliver },
      { hash: vi.fn(), verify: vi.fn() },
      new PasswordWorkLimiter(),
    );
    await expect(
      service.invite(
        { accountId: 'a', authSessionId: 's', requestId: 'r' },
        {
          givenNames: 'A',
          familyNames: 'B',
          email: 'a@example.test',
          roleCodes: ['assistant'],
        },
      ),
    ).rejects.toThrow('rollback');
    expect(deliver).not.toHaveBeenCalled();
  });
});
