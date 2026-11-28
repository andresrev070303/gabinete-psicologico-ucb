import type { ExecutionContext } from '@nestjs/common';
import type { AuthenticationContext } from '@nestjs/authentication';
import { lastValueFrom, of, throwError } from 'rxjs';
import type {
  PublicIdentity,
  PublicSession,
} from '../application/authentication.contracts.js';
import type { AuthenticationService } from '../application/authentication.service.js';
import { SessionActivityInterceptor } from './session-activity.interceptor.js';

function fixture(path: string, authenticated = true) {
  const identity = authenticated ? { accountId: 'account' } : undefined;
  const session = authenticated ? { id: 'session' } : undefined;
  const context = { user: identity, session } as AuthenticationContext<
    PublicIdentity,
    PublicSession
  >;
  const recordActivity = vi.fn().mockResolvedValue(undefined);
  const authentication = { recordActivity } as unknown as AuthenticationService;
  const execution = {
    switchToHttp: () => ({
      getRequest: () => ({ path, method: 'GET', headers: {} }),
    }),
  } as unknown as ExecutionContext;
  return {
    interceptor: new SessionActivityInterceptor(context, authentication),
    execution,
    recordActivity,
  };
}

describe('SessionActivityInterceptor', () => {
  it('records successful authenticated activity after the handler succeeds', async () => {
    const { interceptor, execution, recordActivity } = fixture('/accounts');
    expect(
      await lastValueFrom(
        interceptor.intercept(execution, { handle: () => of('result') }),
      ),
    ).toBe('result');
    expect(recordActivity).toHaveBeenCalledExactlyOnceWith(
      'account',
      'session',
      expect.any(String),
    );
  });

  it('does not extend a session after a rejected operation', async () => {
    const { interceptor, execution, recordActivity } = fixture('/accounts');
    await expect(
      lastValueFrom(
        interceptor.intercept(execution, {
          handle: () => throwError(() => new Error('denied')),
        }),
      ),
    ).rejects.toThrow('denied');
    expect(recordActivity).not.toHaveBeenCalled();
  });

  it.each(['/auth/me', '/auth/sign-out', '/notifications', '/notifications/'])(
    'does not extend activity for %s',
    async (path) => {
      const { interceptor, execution, recordActivity } = fixture(path);
      await lastValueFrom(
        interceptor.intercept(execution, { handle: () => of('result') }),
      );
      expect(recordActivity).not.toHaveBeenCalled();
    },
  );

  it('does not extend activity for anonymous health probes', async () => {
    const { interceptor, execution, recordActivity } = fixture(
      '/health/database',
      false,
    );
    await lastValueFrom(
      interceptor.intercept(execution, { handle: () => of('ok') }),
    );
    expect(recordActivity).not.toHaveBeenCalled();
  });
});
