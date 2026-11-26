import {
  canDesignateDirector,
  requiresRecentAuthentication,
} from './director.rules.js';

describe('Director rules', () => {
  const target = {
    accountId: 'candidate',
    status: 'active',
    personActive: true,
    activatedCandidate: true,
    roleHistory: [] as string[],
  };
  it('accepts an activated candidate with no incompatible role history', () => {
    expect(canDesignateDirector('administrator', target)).toBe(true);
    expect(
      canDesignateDirector('administrator', {
        ...target,
        roleHistory: ['director'],
      }),
    ).toBe(true);
  });
  it.each([
    { ...target, accountId: 'administrator' },
    { ...target, status: 'invited' },
    { ...target, status: 'disabled' },
    { ...target, personActive: false },
    { ...target, activatedCandidate: false },
    ...['administrator', 'psychologist', 'assistant', 'degree_student'].map(
      (role) => ({ ...target, roleHistory: [role] }),
    ),
  ])(
    'rejects self-assignment, unactivated accounts and incompatible histories',
    (candidate) => {
      expect(canDesignateDirector('administrator', candidate)).toBe(false);
    },
  );
  it('requires reauthentication after ten minutes, including the boundary', () => {
    const now = Date.parse('2026-11-26T10:00:00Z');
    expect(requiresRecentAuthentication(now - 599_999, now)).toBe(false);
    expect(requiresRecentAuthentication(now - 600_000, now)).toBe(true);
    expect(requiresRecentAuthentication(Number.NaN, now)).toBe(true);
  });
});
