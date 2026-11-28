import { BadRequestException } from '@nestjs/common';
import type { PipeTransform } from '@nestjs/common';
import type {
  EntryChange,
  NewPlacement,
  NewTask,
  PageQuery,
  PlacementChange,
  StartTimer,
  ResumeEntry,
  StopTimer,
  TaskChange,
} from '../application/practicum.contracts.js';
import {
  activityKinds,
  placementStatuses,
  validDate,
} from '../domain/practicum.rules.js';

function record(
  value: unknown,
  allowed: readonly string[],
): Record<string, unknown> {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.keys(value).some((key) => !allowed.includes(key))
  )
    throw new Error('Invalid fields.');
  return value as Record<string, unknown>;
}
function text(value: unknown, min: number, max: number): string {
  if (
    typeof value !== 'string' ||
    value.trim().length < min ||
    value.trim().length > max ||
    Array.from(value).some((character) => {
      const code = character.charCodeAt(0);
      return (
        code === 127 || (code < 32 && code !== 9 && code !== 10 && code !== 13)
      );
    })
  )
    throw new Error('Invalid text.');
  return value.trim();
}
function optionalText(value: unknown, max = 2000): string | null {
  return value === null || value === undefined || value === ''
    ? null
    : text(value, 1, max);
}
function uuid(value: unknown): string {
  if (
    typeof value !== 'string' ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu.test(
      value,
    )
  )
    throw new Error('Invalid id.');
  return value;
}
function timestamp(value: unknown): string {
  if (
    typeof value !== 'string' ||
    value.length > 40 ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,6})?)?(Z|[+-]\d{2}:\d{2})$/u.test(
      value,
    ) ||
    !validDate(value.slice(0, 10)) ||
    !Number.isFinite(Date.parse(value))
  )
    throw new Error('Invalid timestamp.');
  return new Date(value).toISOString();
}
function choice<T extends string>(value: unknown, allowed: readonly T[]): T {
  if (typeof value !== 'string' || !allowed.includes(value as T))
    throw new Error('Invalid choice.');
  return value as T;
}
function version(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1)
    throw new Error('Invalid version.');
  return value;
}
export const parseEmpty = (value: unknown): Record<string, never> => {
  record(value ?? {}, []);
  return {};
};
export const parsePlacement = (value: unknown): NewPlacement => {
  const input = record(value, ['studentAccountId']);
  return {
    studentAccountId: uuid(input.studentAccountId),
  };
};
export const parsePlacementChange = (value: unknown): PlacementChange => {
  const input = record(value, ['status', 'version', 'reason']);
  return {
    status: choice(input.status, placementStatuses),
    version: version(input.version),
    reason: text(input.reason, 5, 500),
  };
};
export const parseTask = (value: unknown): NewTask => {
  const input = record(value, [
    'id',
    'title',
    'projectLabel',
    'activityKind',
    'description',
    'startTimer',
    'entryId',
  ]);
  if (input.startTimer !== true && input.startTimer !== false)
    throw new Error('Invalid start option.');
  return {
    id: uuid(input.id),
    title: text(input.title, 3, 180),
    projectLabel: text(input.projectLabel, 1, 180),
    activityKind: choice(input.activityKind, activityKinds),
    description: optionalText(input.description),
    startTimer: input.startTimer,
    entryId: input.startTimer ? uuid(input.entryId) : null,
  };
};
export const parseTaskChange = (value: unknown): TaskChange => {
  const input = record(value, ['status', 'version', 'reason']);
  const status = choice(input.status, [
    'active',
    'completed',
    'archived',
  ] as const);
  return {
    status,
    version: version(input.version),
    reason:
      status === 'archived'
        ? text(input.reason, 5, 500)
        : optionalText(input.reason, 500),
  };
};
export const parseStopTimer = (value: unknown): StopTimer => {
  const input = record(value ?? {}, ['stoppedAt']);
  return {
    stoppedAt:
      input.stoppedAt === undefined ? null : timestamp(input.stoppedAt),
  };
};
export const parseStartTimer = (value: unknown): StartTimer => {
  const input = record(value, ['id', 'taskId', 'description']);
  return {
    id: uuid(input.id),
    taskId: uuid(input.taskId),
    description: optionalText(input.description),
  };
};
export const parseEntryChange = (value: unknown): EntryChange => {
  const input = record(value, [
    'title',
    'projectLabel',
    'description',
    'version',
  ]);
  return {
    title: text(input.title, 3, 180),
    projectLabel: text(input.projectLabel, 1, 180),
    description: optionalText(input.description),
    version: version(input.version),
  };
};
export const parseResumeEntry = (value: unknown): ResumeEntry => {
  const input = record(value, ['id']);
  return { id: uuid(input.id) };
};
export const parseVoidEntry = (
  value: unknown,
): { version: number; reason: string } => {
  const input = record(value, ['version', 'reason']);
  return {
    version: version(input.version),
    reason: text(input.reason, 5, 500),
  };
};
export const parsePage = (value: unknown): PageQuery => {
  const input = record(value, ['cursor', 'limit']);
  if (
    input.cursor !== undefined &&
    (typeof input.cursor !== 'string' ||
      !/^[A-Za-z0-9_-]{1,2048}$/u.test(input.cursor))
  )
    throw new Error('Invalid cursor.');
  if (
    input.limit !== undefined &&
    (typeof input.limit !== 'string' || !/^[1-9]\d?$/u.test(input.limit))
  )
    throw new Error('Invalid limit.');
  const limit = Number(input.limit ?? 20);
  if (limit > 50) throw new Error('Invalid limit.');
  return {
    cursor: typeof input.cursor === 'string' ? input.cursor : null,
    limit,
  };
};
export class PracticumInputPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly parse: (value: unknown) => T) {}
  transform(value: unknown): T {
    try {
      return this.parse(value);
    } catch {
      throw new BadRequestException({
        statusCode: 400,
        code: 'invalid_input',
        message: 'Invalid practice data.',
      });
    }
  }
}
