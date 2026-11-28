import { Policy } from '@nestjs/authorization';
import type { PublicIdentity } from '../../identity/application/authentication.contracts.js';
import {
  canManageInstitutional,
  canReadInstitutional,
} from '../domain/institutional.rules.js';
@Policy()
export class InstitutionalAccessPolicy {
  read(user: PublicIdentity | null) {
    return canReadInstitutional(user);
  }
  manage(user: PublicIdentity | null) {
    return canManageInstitutional(user);
  }
}
