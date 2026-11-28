export const recordKinds = ['activity', 'agreement', 'project'] as const;
export type RecordKind = (typeof recordKinds)[number];
export const activityTypes = [
  'workshop',
  'talk',
  'campaign',
  'training',
  'meeting',
  'research',
  'other',
] as const;
export const recordTypes = [...activityTypes, 'agreement', 'program'] as const;
export type RecordType = (typeof recordTypes)[number];
export type InstitutionalIdentity = Readonly<{
  roles: readonly string[];
  permissions: readonly string[];
}>;
export type InstitutionalErrorCode =
  | 'forbidden'
  | 'not_found'
  | 'invalid_input'
  | 'invalid_period'
  | 'invalid_transition'
  | 'invalid_reference'
  | 'version_conflict'
  | 'duplicate'
  | 'linked_records'
  | 'unavailable';
export class InstitutionalError extends Error {
  constructor(readonly code: InstitutionalErrorCode) {
    super(code);
    this.name = 'InstitutionalError';
  }
}
export function canManageInstitutional(
  identity: InstitutionalIdentity | null,
): boolean {
  return (
    !!identity &&
    identity.roles.includes('director') &&
    identity.permissions.includes('institutional.manage')
  );
}
export function canReadInstitutional(
  identity: InstitutionalIdentity | null,
): boolean {
  return (
    canManageInstitutional(identity) ||
    (!!identity &&
      identity.roles.some((role) =>
        ['psychologist', 'assistant', 'degree_student'].includes(role),
      ) &&
      identity.permissions.includes('institutional.read_assigned'))
  );
}
export function validDate(value: string): boolean {
  const date = new Date(`${value}T00:00:00Z`);
  return (
    /^\d{4}-\d{2}-\d{2}$/u.test(value) &&
    Number.isFinite(date.getTime()) &&
    date.toISOString().slice(0, 10) === value
  );
}
export function validatePeriod(
  kind: RecordKind,
  start: string | null,
  end: string | null,
): void {
  if (kind === 'activity' && !start)
    throw new InstitutionalError('invalid_period');
  for (const value of [start, end])
    if (
      value !== null &&
      (kind === 'activity'
        ? !Number.isFinite(Date.parse(value))
        : !validDate(value))
    )
      throw new InstitutionalError('invalid_period');
  if (end && !start) throw new InstitutionalError('invalid_period');
  if (
    start &&
    end &&
    (kind === 'activity' ? Date.parse(end) <= Date.parse(start) : end < start)
  )
    throw new InstitutionalError('invalid_period');
}
const transitions: Readonly<
  Record<RecordKind, Readonly<Record<string, readonly string[]>>>
> = {
  activity: {
    planned: ['completed', 'cancelled'],
    completed: [],
    cancelled: [],
  },
  agreement: {
    draft: ['active', 'closed'],
    active: ['closed'],
    expired: ['closed'],
    closed: [],
  },
  project: {
    planned: ['active', 'completed', 'cancelled'],
    active: ['completed', 'cancelled'],
    completed: [],
    cancelled: [],
  },
};
export function assertTransition(
  kind: RecordKind,
  current: string,
  next: string,
  start: string | null,
  now: string,
): void {
  if (!transitions[kind][current]?.includes(next))
    throw new InstitutionalError('invalid_transition');
  if (
    kind === 'activity' &&
    next === 'completed' &&
    (!start || Date.parse(start) > Date.parse(now))
  )
    throw new InstitutionalError('invalid_transition');
}
export const isTerminal = (kind: RecordKind, status: string): boolean =>
  kind === 'agreement'
    ? status === 'closed'
    : status === 'completed' || status === 'cancelled';

export function assertEditable(
  kind: RecordKind,
  status: string,
  start: string | null,
  now: string,
): void {
  if (kind === 'activity' && status === 'completed') {
    if (!start || Date.parse(start) > Date.parse(now))
      throw new InstitutionalError('invalid_period');
    return;
  }
  if (isTerminal(kind, status))
    throw new InstitutionalError('invalid_transition');
}
