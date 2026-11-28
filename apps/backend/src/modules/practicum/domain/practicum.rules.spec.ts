import { describe, expect, it } from 'vitest';
import {
  assertAccess,
  canManagePracticum,
  canReadPracticum,
  canTrackPracticum,
  PracticumError,
  TimeInterval,
  validDate,
} from './practicum.rules.js';
const now = '2026-11-27T16:00:00Z';
describe('Practice time rules', () => {
  it('accepts adjacent intervals while rejecting overlapping work', () => {
    const first = new TimeInterval(
      '2026-11-27T10:00:00-04:00',
      '2026-11-27T11:00:00-04:00',
    );
    expect(
      first.overlaps(new TimeInterval('2026-11-27T11:00:00-04:00', null)),
    ).toBe(false);
    expect(
      first.overlaps(new TimeInterval('2026-11-27T10:59:00-04:00', null)),
    ).toBe(true);
  });
  it.each([
    ['invalid', now],
    [now, now],
    [now, '2026-11-26T16:00:00Z'],
  ])('rejects an invalid interval %s to %s', (start, end) => {
    expect(() => new TimeInterval(start, end)).toThrow(PracticumError);
  });
  it('accepts past work without an academic period or enrollment dates', () => {
    expect(() =>
      new TimeInterval(
        '2025-01-01T10:00:00Z',
        '2025-01-01T11:00:00Z',
      ).assertNotFuture(now),
    ).not.toThrow();
  });
  it('rejects future work and invalid server timestamps', () => {
    expect(() =>
      new TimeInterval(now, '2026-11-27T17:00:00Z').assertNotFuture(now),
    ).toThrow(PracticumError);
    expect(() =>
      new TimeInterval(now, null).assertNotFuture('invalid'),
    ).toThrow(PracticumError);
    expect(validDate('2026-02-30')).toBe(false);
  });
});

describe('Practice access rules', () => {
  it('keeps technical administration outside practice management', () => {
    expect(
      canManagePracticum({
        accountId: 'a',
        roles: ['administrator'],
        permissions: ['practicum.manage'],
      }),
    ).toBe(false);
    expect(
      canManagePracticum({
        accountId: 'a',
        roles: ['director'],
        permissions: ['practicum.manage'],
      }),
    ).toBe(true);
  });
  it.each(['assistant', 'degree_student'])(
    'allows the %s profile to record its own work with an explicit grant',
    (role) => {
      expect(
        canTrackPracticum({
          accountId: 'a',
          roles: [role],
          permissions: ['practicum.track_own'],
        }),
      ).toBe(true);
      expect(
        canTrackPracticum({ accountId: 'a', roles: [role], permissions: [] }),
      ).toBe(false);
    },
  );
  it('lets supervisors read assigned practices without time-entry privileges', () => {
    const identity = {
      accountId: 'a',
      roles: ['psychologist'],
      permissions: ['practicum.read_supervised'],
    };
    expect(canReadPracticum(identity)).toBe(true);
    expect(() => assertAccess(identity, 'edit')).toThrow(PracticumError);
    expect(canReadPracticum(null)).toBe(false);
  });
});
