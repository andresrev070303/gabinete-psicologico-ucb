import { Policy } from '@nestjs/authorization';
import type { PublicIdentity } from '../../identity/application/authentication.contracts.js';
import {
  canManagePracticum,
  canReadPracticum,
  canTrackPracticum,
} from '../domain/practicum.rules.js';

@Policy()
export class PracticumAccessPolicy {
  own(user: PublicIdentity | null) {
    return (
      !!user &&
      user.roles.some(
        (role) => role === 'assistant' || role === 'degree_student',
      ) &&
      user.permissions.includes('practicum.read_own')
    );
  }
  read(user: PublicIdentity | null) {
    return canReadPracticum(user);
  }
  manage(user: PublicIdentity | null) {
    return canManagePracticum(user);
  }
  track(user: PublicIdentity | null) {
    return canTrackPracticum(user);
  }
  edit(user: PublicIdentity | null) {
    return canManagePracticum(user) || canTrackPracticum(user);
  }
}
