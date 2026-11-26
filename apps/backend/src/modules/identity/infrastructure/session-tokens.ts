import { createHash, randomBytes } from 'node:crypto';
import type { SessionTokenCodec } from '../application/authentication.contracts.js';

export class SessionTokens implements SessionTokenCodec {
  issue() {
    const token = randomBytes(32).toString('base64url');
    return { token, hash: this.hash(token)! };
  }
  hash(token: string): Buffer | null {
    if (!/^[A-Za-z0-9_-]{43}$/u.test(token)) return null;
    if (Buffer.from(token, 'base64url').toString('base64url') !== token)
      return null;
    return createHash('sha256').update(token, 'ascii').digest();
  }
}
