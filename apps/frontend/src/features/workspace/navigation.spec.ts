import { describe, expect, it } from 'vitest';
import { getNavigation } from './navigation';
import type { AuthenticatedIdentity } from '../auth/auth.types';

function identity(
  roles: readonly string[],
  permissions: readonly string[] = [],
): AuthenticatedIdentity['identity'] {
  return {
    accountId: 'test',
    givenNames: 'Test',
    familyNames: 'User',
    email: 'test@example.test',
    roles,
    permissions,
  };
}

describe('Workspace navigation', () => {
  it.each([
    ['director', ['practicum', 'institutional', 'reports']],
    ['psychologist', ['agenda', 'cases', 'supervisions']],
    ['assistant', ['tasks', 'hours', 'my-practice']],
    ['degree_student', ['project', 'tasks', 'documents']],
  ])(
    'prepares the %s workspace without exposing unfinished operations',
    (role, expected) => {
      const items = getNavigation(identity([String(role)]));
      for (const id of expected)
        expect(items.find((item) => item.id === id)?.available).toBe(false);
      expect(items.find((item) => item.id === 'accounts')).toBeUndefined();
      expect(items.find((item) => item.id === 'system')).toBeUndefined();
    },
  );

  it('requires explicit permissions for existing account and audit screens', () => {
    expect(
      getNavigation(identity(['administrator'])).map((item) => item.id),
    ).toEqual(['home', 'system', 'profile']);
    const items = getNavigation(
      identity(['administrator'], ['accounts.read', 'audit.read_identity']),
    );
    expect(items.find((item) => item.id === 'accounts')?.label).toBe(
      'Dirección del Gabinete',
    );
    expect(items.find((item) => item.id === 'audit')?.available).toBe(true);
    expect(items.find((item) => item.id === 'practicum')).toBeUndefined();
  });

  it('combines multiple profiles without duplicate menus or administrator access', () => {
    const items = getNavigation(
      identity(['assistant', 'degree_student', 'psychologist']),
    );
    expect(items.filter((item) => item.id === 'tasks')).toHaveLength(1);
    expect(items.filter((item) => item.id === 'cases')).toHaveLength(1);
    expect(items.find((item) => item.id === 'system')).toBeUndefined();
    expect(items.find((item) => item.id === 'project')).toBeDefined();
  });

  it('keeps an account without a recognized role limited to home and its own profile', () => {
    expect(
      getNavigation(identity(['unrecognized'])).map((item) => item.id),
    ).toEqual(['home', 'profile']);
  });
});
