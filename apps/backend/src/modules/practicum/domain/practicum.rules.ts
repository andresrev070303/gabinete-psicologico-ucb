export const activityKinds = [
  'administration',
  'direct_care',
  'evaluation_support',
  'workshop',
  'research',
  'training',
  'other',
] as const;
export type ActivityKind = (typeof activityKinds)[number];
export const placementStatuses = ['active', 'completed'] as const;
export type PlacementStatus = (typeof placementStatuses)[number];
export type TaskStatus = 'active' | 'completed' | 'archived';
export type PracticumOperation = 'read' | 'manage' | 'track' | 'edit';
export type AccessIdentity = Readonly<{
  accountId: string;
  roles: readonly string[];
  permissions: readonly string[];
}>;
export type PracticumErrorCode =
  | 'forbidden'
  | 'not_found'
  | 'invalid_input'
  | 'inactive_placement'
  | 'invalid_period'
  | 'inactive_task'
  | 'timer_running'
  | 'overlap'
  | 'version_conflict'
  | 'duplicate'
  | 'unavailable';

export class PracticumError extends Error {
  constructor(readonly code: PracticumErrorCode) {
    super(code);
    this.name = 'PracticumError';
  }
}

export function canManagePracticum(identity: AccessIdentity | null): boolean {
  return (
    !!identity &&
    identity.roles.includes('director') &&
    identity.permissions.includes('practicum.manage')
  );
}
export function canTrackPracticum(identity: AccessIdentity | null): boolean {
  return (
    !!identity &&
    identity.roles.some(
      (role) => role === 'assistant' || role === 'degree_student',
    ) &&
    identity.permissions.includes('practicum.track_own')
  );
}
export function canReadPracticum(identity: AccessIdentity | null): boolean {
  return (
    canManagePracticum(identity) ||
    (!!identity &&
      ((identity.roles.includes('psychologist') &&
        identity.permissions.includes('practicum.read_supervised')) ||
        (identity.roles.some(
          (role) => role === 'assistant' || role === 'degree_student',
        ) &&
          identity.permissions.includes('practicum.read_own'))))
  );
}
export function assertAccess(
  identity: AccessIdentity,
  operation: PracticumOperation,
): void {
  const allowed =
    operation === 'manage'
      ? canManagePracticum(identity)
      : operation === 'track'
        ? canTrackPracticum(identity)
        : operation === 'edit'
          ? canManagePracticum(identity) || canTrackPracticum(identity)
          : canReadPracticum(identity);
  if (!allowed) throw new PracticumError('forbidden');
}

export function validDate(value: string): boolean {
  return (
    /^\d{4}-\d{2}-\d{2}$/u.test(value) &&
    Number.isFinite(Date.parse(`${value}T00:00:00Z`)) &&
    new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value
  );
}

/** A stop may compensate for transport delay, never supply an arbitrary historical interval. */
export function resolveStopTime(
  startedAt: string,
  serverNow: string,
  requestedAt: string | null,
): string {
  if (requestedAt === null) return serverNow;
  const requested = Date.parse(requestedAt);
  const now = Date.parse(serverNow);
  if (
    !Number.isFinite(requested) ||
    requested <= Date.parse(startedAt) ||
    now - requested > 300_000 ||
    requested - now > 5_000
  )
    throw new PracticumError('invalid_period');
  return new Date(Math.min(requested, now)).toISOString();
}
/** Immutable interval. PostgreSQL and this value object both enforce its boundaries. */
export class TimeInterval {
  readonly startedAt: string;
  readonly endedAt: string | null;
  constructor(startedAt: string, endedAt: string | null) {
    const start = Date.parse(startedAt);
    const end = endedAt === null ? null : Date.parse(endedAt);
    if (
      !Number.isFinite(start) ||
      (end !== null && (!Number.isFinite(end) || end <= start))
    )
      throw new PracticumError('invalid_period');
    this.startedAt = new Date(start).toISOString();
    this.endedAt = end === null ? null : new Date(end).toISOString();
  }
  assertNotFuture(now: string): void {
    const current = Date.parse(now);
    if (
      !Number.isFinite(current) ||
      Date.parse(this.startedAt) > current ||
      (this.endedAt !== null && Date.parse(this.endedAt) > current)
    )
      throw new PracticumError('invalid_period');
  }
  overlaps(other: TimeInterval): boolean {
    return (
      Date.parse(this.startedAt) <
        (other.endedAt === null ? Infinity : Date.parse(other.endedAt)) &&
      Date.parse(other.startedAt) <
        (this.endedAt === null ? Infinity : Date.parse(this.endedAt))
    );
  }
}
