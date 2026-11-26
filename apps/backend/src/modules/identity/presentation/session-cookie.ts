import type { CookieOptions, Request } from 'express';
import { randomUUID } from 'node:crypto';

const requestIdKey = Symbol('identity-request-id');
export function requestId(request: Request): string {
  const carrier = request as Request & { [requestIdKey]?: string };
  return (carrier[requestIdKey] ??= randomUUID());
}

export class SessionCookie {
  readonly name: string;
  readonly options: CookieOptions;
  constructor(secure: boolean) {
    this.name = secure ? '__Host-gabinete_session' : 'gabinete_session';
    this.options = { httpOnly: true, secure, sameSite: 'lax', path: '/' };
  }
  read(request: Request): string | undefined {
    const values = (request.headers.cookie ?? '')
      .split(';')
      .map((part) => part.trim())
      .filter((part) => part.startsWith(`${this.name}=`));
    // Reject ambiguous duplicate cookie names; the credential is base64url, never URI encoded.
    return values.length === 1
      ? values[0].slice(this.name.length + 1)
      : undefined;
  }
}
