import { describe, expect, it } from 'vitest';
import {
  formatDuration,
  formatTotalTime,
  fromLocalDateTime,
  localDateTime,
} from './practicum.presentation';
describe('Practice time presentation', () => {
  it.each([
    [0, '0 horas y 0 minutos'],
    [5700, '1 hora y 35 minutos'],
    [45300, '12 horas y 35 minutos'],
    [3660, '1 hora y 1 minuto'],
  ])('formats %s seconds as %s', (seconds, expected) => {
    expect(formatTotalTime(Number(seconds))).toBe(expected);
  });
  it('keeps duration precise without rounding unfinished minutes up', () => {
    expect(formatDuration(3661.9)).toBe('01:01:01');
    expect(formatTotalTime(59)).toBe('0 horas y 0 minutos');
    expect(formatDuration(-1)).toBe('00:00:00');
  });
  it('converts manual Bolivian hours to UTC and restores the same local input', () => {
    expect(fromLocalDateTime('2026-11-27T09:35:00')).toBe(
      '2026-11-27T13:35:00.000Z',
    );
    expect(localDateTime('2026-11-27T13:35:00.000Z')).toBe(
      '2026-11-27T09:35:00',
    );
    expect(() => fromLocalDateTime('invalid')).toThrow('válidas');
  });
});
