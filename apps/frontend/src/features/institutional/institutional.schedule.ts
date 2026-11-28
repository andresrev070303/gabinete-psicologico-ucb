import type { RecordKind } from './institutional.types';
import { dateInput, scheduleValue } from './institutional.presentation';

export type ScheduleInput = Readonly<{
  date: string;
  time: string;
}>;

export const clockPattern = '([01][0-9]|2[0-3]):[0-5][0-9]';
const clockExpression = new RegExp(`^${clockPattern}$`, 'u');

/** Mask compact input and carry excess minutes without silently changing the date. */
export function formatClockInput(value: string, previous: string): string {
  if (value === '') return '';
  if (!/^\d{0,4}(?::\d{0,2})?$/u.test(value)) return previous;
  const explicit = value.includes(':');
  const parts = value.split(':');
  const hours = explicit ? parts[0]! : value.slice(0, 2);
  const minutes = explicit ? parts[1]! : value.slice(2);
  if (hours.length > 2 || minutes.length > 2) return previous;
  if (!hours) return value;
  const hour = Number(hours);
  if (hour > 23) return previous;
  if (!explicit && value.length <= 2) return value;
  const paddedHour = hours.padStart(2, '0');
  if (minutes.length < 2) return `${paddedHour}:${minutes}`;
  const totalMinutes = hour * 60 + Number(minutes);
  if (totalMinutes >= 24 * 60) return previous;
  return `${String(Math.floor(totalMinutes / 60)).padStart(2, '0')}:${String(totalMinutes % 60).padStart(2, '0')}`;
}

export function readSchedule(
  value: string | null,
  kind: RecordKind,
): ScheduleInput {
  if (!value) return { date: '', time: '' };
  const local = dateInput(value, kind);
  if (kind !== 'activity') return { date: local, time: '' };
  return {
    date: local.slice(0, 10),
    time: local.slice(11, 16),
  };
}

function validCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return (
    Number.isFinite(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === value
  );
}

/** UI conversion only: the API still receives the same UTC timestamps or calendar dates. */
export function serializeSchedule(
  value: ScheduleInput,
  kind: RecordKind,
): string | null {
  if (!validCalendarDate(value.date)) return null;
  if (kind !== 'activity') return value.date;
  if (!clockExpression.test(value.time)) return null;
  const local = `${value.date}T${value.time}`;
  return scheduleValue(local, kind);
}
