import { describe, expect, it } from 'vitest';
import {
  InstitutionalError,
  assertTransition,
  assertEditable,
  canManageInstitutional,
  canReadInstitutional,
  validatePeriod,
} from './institutional.rules.js';

describe('Institutional rules', () => {
  it('allows editing completed activities without reopening them or moving them into the future', () => {
    const now = '2026-12-02T00:00:00Z';
    expect(() =>
      assertEditable('activity', 'completed', '2026-12-01T13:00:00Z', now),
    ).not.toThrow();
    expect(() =>
      assertEditable('activity', 'completed', '2026-12-03T13:00:00Z', now),
    ).toThrow(InstitutionalError);
    expect(() =>
      assertEditable('activity', 'cancelled', '2026-12-01T13:00:00Z', now),
    ).toThrow(InstitutionalError);
    expect(() =>
      assertEditable('project', 'completed', '2026-12-01', now),
    ).toThrow(InstitutionalError);
    expect(() =>
      assertEditable('agreement', 'closed', '2026-12-01', now),
    ).toThrow(InstitutionalError);
  });
  it('requires both the director role and its permission for management', () => {
    expect(
      canManageInstitutional({
        roles: ['director'],
        permissions: ['institutional.manage'],
      }),
    ).toBe(true);
    expect(
      canManageInstitutional({
        roles: ['administrator'],
        permissions: ['institutional.manage'],
      }),
    ).toBe(false);
    expect(
      canManageInstitutional({ roles: ['director'], permissions: [] }),
    ).toBe(false);
  });
  it.each(['psychologist', 'assistant', 'degree_student'])(
    'allows scoped reading for %s',
    (role) => {
      expect(
        canReadInstitutional({
          roles: [role],
          permissions: ['institutional.read_assigned'],
        }),
      ).toBe(true);
      expect(canReadInstitutional({ roles: [role], permissions: [] })).toBe(
        false,
      );
    },
  );
  it('keeps technical administrators outside institutional records', () => {
    expect(
      canReadInstitutional({
        roles: ['administrator'],
        permissions: ['institutional.read_assigned'],
      }),
    ).toBe(false);
  });
  it('validates an event interval separately from an inclusive agreement date range', () => {
    expect(() =>
      validatePeriod(
        'activity',
        '2026-12-01T13:00:00Z',
        '2026-12-01T15:00:00Z',
      ),
    ).not.toThrow();
    expect(() =>
      validatePeriod(
        'activity',
        '2026-12-01T13:00:00Z',
        '2026-12-01T13:00:00Z',
      ),
    ).toThrow(InstitutionalError);
    expect(() =>
      validatePeriod('agreement', '2026-12-01', '2026-12-01'),
    ).not.toThrow();
    expect(() => validatePeriod('project', '2026-12-02', '2026-12-01')).toThrow(
      InstitutionalError,
    );
    expect(() => validatePeriod('agreement', '2026-02-30', null)).toThrow(
      InstitutionalError,
    );
  });
  it('allows completion without results or attendance after the activity starts', () => {
    const now = '2026-12-02T00:00:00Z';
    expect(() =>
      assertTransition(
        'activity',
        'planned',
        'completed',
        '2026-12-01T13:00:00Z',
        now,
      ),
    ).not.toThrow();
    expect(() =>
      assertTransition(
        'activity',
        'planned',
        'completed',
        '2026-12-03T13:00:00Z',
        now,
      ),
    ).toThrow(InstitutionalError);
  });
  it('rejects reopening a completed event or using another resource status', () => {
    expect(() =>
      assertTransition(
        'activity',
        'completed',
        'planned',
        '2026-12-01T13:00:00Z',
        '2026-12-02T00:00:00Z',
      ),
    ).toThrow(InstitutionalError);
    expect(() =>
      assertTransition(
        'agreement',
        'draft',
        'completed',
        '2026-12-01',
        '2026-12-02T00:00:00Z',
      ),
    ).toThrow(InstitutionalError);
  });
});
