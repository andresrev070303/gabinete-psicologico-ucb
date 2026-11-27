import {
  canManageOperationalAccount,
  normalizeContactPhone,
  normalizeDisableReason,
  validateOperationalRoles,
} from './account-lifecycle.rules.js';

describe('Operational account boundaries', () => {
  it.each(['psychologist', 'assistant', 'degree_student'])(
    'allows an operational %s history',
    (role) => {
      expect(
        canManageOperationalAccount('actor', {
          accountId: 'target',
          roleHistory: [role],
        }),
      ).toBe(true);
    },
  );
  it.each([
    [],
    ['director'],
    ['administrator'],
    ['psychologist', 'director'],
    ['assistant', 'administrator'],
  ])('protects incompatible history %j', (...history) => {
    expect(
      canManageOperationalAccount('actor', {
        accountId: 'target',
        roleHistory: history as string[],
      }),
    ).toBe(false);
  });
  it('never allows self administration', () => {
    expect(
      canManageOperationalAccount('actor', {
        accountId: 'actor',
        roleHistory: ['psychologist'],
      }),
    ).toBe(false);
  });
  it.each(
    [
      [],
      ['administrator'],
      ['director'],
      ['psychologist', 'psychologist'],
      null,
      'assistant',
    ].map((roles) => ({ roles })),
  )('rejects an invalid role selection $roles', ({ roles }) => {
    expect(() => validateOperationalRoles(roles)).toThrow();
  });
  it('permits explicit revocation of the last role and sorts a valid selection', () => {
    expect(validateOperationalRoles([], true)).toEqual([]);
    expect(validateOperationalRoles(['psychologist', 'assistant'])).toEqual([
      'assistant',
      'psychologist',
    ]);
  });
  it('validates phone and incident reason without interpreting them as credentials', () => {
    expect(normalizeContactPhone(' +591 70000000 ')).toBe('+591 70000000');
    expect(normalizeContactPhone(null)).toBeNull();
    expect(() => normalizeContactPhone('a\r\nb')).toThrow();
    expect(normalizeDisableReason(' Access suspended ')).toBe(
      'Access suspended',
    );
    expect(() => normalizeDisableReason(' ')).toThrow();
  });
});
