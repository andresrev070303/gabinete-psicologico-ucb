import { BadRequestException } from '@nestjs/common';
import type { PipeTransform } from '@nestjs/common';
import type {
  ListQuery,
  NewRecord,
  RecordChange,
  RecordDraft,
  StatusChange,
} from '../application/institutional.contracts.js';
import {
  activityTypes,
  recordKinds,
  recordTypes,
  validDate,
} from '../domain/institutional.rules.js';

function object(
  value: unknown,
  allowed: readonly string[],
): Record<string, unknown> {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.keys(value).some((key) => !allowed.includes(key))
  )
    throw Error('Invalid fields');
  return value as Record<string, unknown>;
}
function text(value: unknown, min: number, max: number): string {
  if (
    typeof value !== 'string' ||
    value.trim().length < min ||
    value.trim().length > max ||
    Array.from(value).some((character) => {
      const code = character.charCodeAt(0);
      return code === 127 || (code < 32 && ![9, 10, 13].includes(code));
    })
  )
    throw Error('Invalid text');
  return value.trim();
}
const optionalText = (value: unknown, max: number): string | null =>
  value === undefined || value === null || value === ''
    ? null
    : text(value, 1, max);
function uuid(value: unknown): string {
  const id = text(value, 36, 36);
  if (!/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/iu.test(id))
    throw Error('Invalid id');
  return id.toLowerCase();
}
const optionalId = (value: unknown) =>
  value === undefined || value === null || value === '' ? null : uuid(value);
function choice<T extends string>(value: unknown, allowed: readonly T[]): T {
  if (typeof value !== 'string' || !allowed.includes(value as T))
    throw Error('Invalid choice');
  return value as T;
}
function version(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1)
    throw Error('Invalid version');
  return value;
}
function date(value: unknown): string | null {
  if (value === undefined || value === null || value === '') return null;
  const result = text(value, 10, 10);
  if (!validDate(result)) throw Error('Invalid date');
  return result;
}
function timestamp(value: unknown): string | null {
  if (value === undefined || value === null || value === '') return null;
  const result = text(value, 20, 40);
  if (
    !/^\d{4}-\d{2}-\d{2}T([01]\d|2[0-3]):[0-5]\d(:[0-5]\d(\.\d{1,6})?)?(Z|[+-]\d{2}:\d{2})$/u.test(
      result,
    ) ||
    !validDate(result.slice(0, 10)) ||
    !Number.isFinite(Date.parse(result))
  )
    throw Error('Invalid timestamp');
  return new Date(result).toISOString();
}
const fields = [
  'kind',
  'type',
  'title',
  'description',
  'startsAt',
  'endsAt',
  'institutionId',
  'responsibleAccountId',
  'memberAccountIds',
  'projectId',
  'agreementId',
  'code',
  'venue',
] as const;
function draft(input: Record<string, unknown>): RecordDraft {
  const kind = choice(input.kind, recordKinds);
  const type =
    kind === 'activity'
      ? choice(input.type, activityTypes)
      : choice(
          input.type,
          kind === 'agreement'
            ? (['agreement'] as const)
            : (['program'] as const),
        );
  if (
    !Array.isArray(input.memberAccountIds) ||
    input.memberAccountIds.length > 100
  )
    throw Error('Invalid team');
  const memberAccountIds = input.memberAccountIds.map(uuid);
  if (new Set(memberAccountIds).size !== memberAccountIds.length)
    throw Error('Duplicate member');
  const institutionId = optionalId(input.institutionId);
  const projectId = optionalId(input.projectId),
    agreementId = optionalId(input.agreementId);
  const venue = optionalText(input.venue, 160),
    code = optionalText(input.code, 60);
  if (
    (kind === 'agreement' && !institutionId) ||
    (kind !== 'activity' && (projectId || agreementId || venue)) ||
    (kind === 'activity' && code)
  )
    throw Error('Incompatible fields');
  return {
    kind,
    type,
    title: text(input.title, 3, 180),
    description: optionalText(input.description, 4000),
    startsAt:
      kind === 'activity' ? timestamp(input.startsAt) : date(input.startsAt),
    endsAt: kind === 'activity' ? timestamp(input.endsAt) : date(input.endsAt),
    institutionId,
    responsibleAccountId: uuid(input.responsibleAccountId),
    memberAccountIds,
    projectId,
    agreementId,
    code,
    venue,
  };
}
export const parseNewRecord = (value: unknown): NewRecord => {
  const input = object(value, [...fields, 'id']);
  return { ...draft(input), id: uuid(input.id) };
};
export const parseRecordChange = (value: unknown): RecordChange => {
  const input = object(value, [...fields, 'version']);
  return { ...draft(input), version: version(input.version) };
};
export const parseStatus = (value: unknown): StatusChange => {
  const input = object(value, [
    'version',
    'status',
    'reason',
    'results',
    'reportedParticipants',
  ]);
  const count = input.reportedParticipants ?? null;
  if (
    count !== null &&
    (typeof count !== 'number' ||
      !Number.isSafeInteger(count) ||
      count < 0 ||
      count > 1000000)
  )
    throw Error('Invalid count');
  return {
    version: version(input.version),
    status: choice(input.status, [
      'planned',
      'active',
      'completed',
      'cancelled',
      'draft',
      'expired',
      'closed',
    ]),
    reason: text(input.reason, 5, 500),
    results: optionalText(input.results, 4000),
    reportedParticipants: count as number | null,
  };
};
export const parseArchive = (value: unknown) => {
  const input = object(value, ['version', 'reason']);
  return {
    version: version(input.version),
    reason: text(input.reason, 5, 500),
  };
};
export const parseInstitution = (value: unknown) => {
  const input = object(value, ['id', 'name', 'kind']);
  return {
    id: uuid(input.id),
    name: text(input.name, 3, 200),
    kind: choice(input.kind, [
      'university',
      'ucb_unit',
      'company',
      'school',
      'ngo',
      'public',
      'other',
    ]),
  };
};
export const parseKind = (value: unknown) => choice(value, recordKinds);
export const parseList = (value: unknown): ListQuery => {
  const input = object(value, [
    'cursor',
    'limit',
    'type',
    'status',
    'search',
    'from',
    'to',
  ]);
  const limit = input.limit === undefined ? 20 : Number(input.limit);
  if (
    typeof input.limit !== 'undefined' &&
    (typeof input.limit !== 'string' || !/^\d{1,2}$/u.test(input.limit))
  )
    throw Error('Invalid limit');
  if (!Number.isInteger(limit) || limit < 1 || limit > 50)
    throw Error('Invalid limit');
  const cursor = optionalText(input.cursor, 2048);
  if (cursor && !/^[A-Za-z0-9_-]+$/u.test(cursor))
    throw Error('Invalid cursor');
  const from = date(input.from),
    to = date(input.to);
  if (from && to && to < from) throw Error('Invalid range');
  return {
    cursor,
    limit,
    type: input.type ? choice(input.type, recordTypes) : null,
    status: input.status
      ? choice(input.status, [
          'planned',
          'active',
          'completed',
          'cancelled',
          'draft',
          'expired',
          'closed',
        ])
      : null,
    search: optionalText(input.search, 120) ?? '',
    from,
    to,
  };
};
export class InstitutionalInputPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly parse: (value: unknown) => T) {}
  transform(value: unknown): T {
    try {
      return this.parse(value);
    } catch {
      throw new BadRequestException({
        statusCode: 400,
        code: 'invalid_input',
        message: 'Invalid institutional data.',
      });
    }
  }
}
