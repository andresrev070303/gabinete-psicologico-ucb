import { describe, expect, it } from 'vitest';
import {
  formatClockInput,
  readSchedule,
  serializeSchedule,
} from './institutional.schedule';
import { formatRecordDate } from './institutional.presentation';

describe('Institutional 24-hour schedule in Bolivia', () => {
  it('inserts the colon during typing, supports deletion and carries excess minutes', () => {
    let time = '';
    for (const [input, expected] of [
      ['1', '1'],
      ['15', '15'],
      ['150', '15:0'],
      ['15:00', '15:00'],
    ]) {
      time = formatClockInput(input!, time);
      expect(time).toBe(expected);
    }
    expect(formatClockInput('1500', '')).toBe('15:00');
    expect(formatClockInput('15:60', '15:00')).toBe('16:00');
    expect(formatClockInput('1560', '')).toBe('16:00');
    expect(formatClockInput('15:99', '')).toBe('16:39');
    expect(formatClockInput('9:00', '')).toBe('09:00');
    for (const input of ['15:0', '15:', '15', '1', '']) {
      time = formatClockInput(input, time);
      expect(time).toBe(input);
    }
  });
  it.each(['25', '25:00', '24:00', '23:60', '23:99', 'noon'])(
    'rejects %s without rolling into the next day',
    (input) => {
      expect(formatClockInput(input, '15:00')).toBe('15:00');
    },
  );
  it.each([
    ['09:15', '2026-12-01T13:15:00.000Z'],
    ['15:00', '2026-12-01T19:00:00.000Z'],
    ['00:00', '2026-12-01T04:00:00.000Z'],
    ['12:00', '2026-12-01T16:00:00.000Z'],
    ['23:59', '2026-12-02T03:59:00.000Z'],
  ] as const)(
    'round-trips %s without changing the entered time',
    (time, iso) => {
      const input = { date: '2026-12-01', time };
      expect(serializeSchedule(input, 'activity')).toBe(iso);
      expect(readSchedule(iso, 'activity')).toEqual(input);
    },
  );

  it.each(['24:00', '25:30', '09:60', '9:00', '09:3', '03:00 PM'])(
    'rejects invalid or incomplete HH:mm value %s',
    (time) => {
      expect(
        serializeSchedule({ date: '2026-12-01', time }, 'activity'),
      ).toBeNull();
    },
  );

  it('rejects incomplete schedules and impossible calendar dates', () => {
    expect(
      serializeSchedule({ date: '', time: '09:30' }, 'activity'),
    ).toBeNull();
    expect(
      serializeSchedule({ date: '2026-12-01', time: '' }, 'activity'),
    ).toBeNull();
    expect(
      serializeSchedule({ date: '2026-02-30', time: '09:30' }, 'activity'),
    ).toBeNull();
    expect(
      serializeSchedule(readSchedule(null, 'activity'), 'activity'),
    ).toBeNull();
  });

  it.each(['agreement', 'project'] as const)(
    'keeps %s validity as calendar dates without a time',
    (kind) => {
      const input = readSchedule('2027-01-01', kind);
      expect(input).toEqual({ date: '2027-01-01', time: '' });
      expect(serializeSchedule(input, kind)).toBe('2027-01-01');
      expect(serializeSchedule(readSchedule(null, kind), kind)).toBeNull();
    },
  );
  it('displays afternoon and midnight in 24-hour format', () => {
    expect(formatRecordDate('2026-12-01T19:00:00Z', 'activity')).toContain(
      '15:00',
    );
    expect(formatRecordDate('2026-12-01T04:00:00Z', 'activity')).toContain(
      '00:00',
    );
  });
});
