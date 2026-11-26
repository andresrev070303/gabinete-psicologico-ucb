import type { Request } from 'express';
import { SessionCookie, requestId } from './session-cookie.js';

describe('SessionCookie', () => {
  it('uses host-only secure cookies in production and readable HTTP settings locally', () => {
    const production = new SessionCookie(true);
    expect(production.name).toBe('__Host-gabinete_session');
    expect(production.options).toEqual({
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      path: '/',
    });
    expect(new SessionCookie(false).name).toBe('gabinete_session');
  });

  it('rejects duplicate credentials and ignores other cookie names', () => {
    const cookie = new SessionCookie(false);
    const request = (value: string) =>
      ({ headers: { cookie: value } }) as Request;
    expect(cookie.read(request('other=value; gabinete_session=secret'))).toBe(
      'secret',
    );
    expect(cookie.read(request('other=value'))).toBeUndefined();
    expect(
      cookie.read(request('gabinete_session=one; gabinete_session=two')),
    ).toBeUndefined();
  });

  it('generates a stable per-request audit identifier without trusting incoming headers', () => {
    const request = {
      headers: { 'x-request-id': 'untrusted' },
    } as unknown as Request;
    const first = requestId(request);
    expect(first).toMatch(/^[a-f0-9-]{36}$/u);
    expect(requestId(request)).toBe(first);
    expect(requestId({ headers: {} } as Request)).not.toBe(first);
  });
});
