import type { AuthenticatedIdentity } from '../auth/auth.types';
type Identity = AuthenticatedIdentity['identity'];
export function canManagePractice(identity: Identity): boolean {
  return (
    identity.roles.includes('director') &&
    identity.permissions.includes('practicum.manage')
  );
}
export function canReadOwnPractice(identity: Identity): boolean {
  return (
    identity.roles.some(
      (role) => role === 'assistant' || role === 'degree_student',
    ) && identity.permissions.includes('practicum.read_own')
  );
}
export function canTrackPractice(identity: Identity): boolean {
  return (
    identity.roles.some(
      (role) => role === 'assistant' || role === 'degree_student',
    ) && identity.permissions.includes('practicum.track_own')
  );
}
export function canReadSupervisedPractice(identity: Identity): boolean {
  return (
    identity.roles.includes('psychologist') &&
    identity.permissions.includes('practicum.read_supervised')
  );
}
