import type { Request } from 'express';
import type {
  PublicIdentity,
  PublicSession,
} from '../application/authentication.contracts.js';
import { requestId } from './session-cookie.js';
export function identityActor(
  user: PublicIdentity,
  session: PublicSession,
  request: Request,
) {
  return {
    accountId: user.accountId,
    authSessionId: session.id,
    requestId: requestId(request),
  };
}
