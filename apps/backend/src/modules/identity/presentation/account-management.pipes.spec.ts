import {
  AccountPagePipe,
  ActivateAccountPipe,
  InviteDirectorPipe,
} from './account-management.pipes.js';

describe('Account input validation', () => {
  const invite = new InviteDirectorPipe();
  const candidate = {
    givenNames: ' Test ',
    familyNames: ' Candidate ',
    email: ' ADMIN@EXAMPLE.TEST ',
  };
  it('normalizes names and email without accepting protected fields', () => {
    expect(invite.transform(candidate)).toEqual({
      givenNames: 'Test',
      familyNames: 'Candidate',
      email: 'admin@example.test',
    });
  });
  it.each([
    null,
    [],
    {},
    { ...candidate, role: 'administrator' },
    { ...candidate, accountId: 'forged' },
    { ...candidate, email: 'invalid' },
    { ...candidate, email: 'bad\0@example.test' },
    { ...candidate, givenNames: '\nName' },
    { ...candidate, familyNames: ' ' },
  ])('rejects malformed or privileged invitation data', (value) => {
    expect(() => invite.transform(value)).toThrow();
  });
  it('preserves a valid passphrase and rejects short or oversized passwords', () => {
    const activation = new ActivateAccountPipe();
    expect(
      activation.transform({ token: 'token', password: ' a long passphrase ' }),
    ).toEqual({ token: 'token', password: ' a long passphrase ' });
    for (const password of ['short', 'x'.repeat(129)])
      expect(() =>
        activation.transform({ token: 'token', password }),
      ).toThrow();
  });
  it('bounds pagination and rejects arrays, numbers and SQL-like values', () => {
    const page = new AccountPagePipe();
    expect(page.transform({})).toEqual({ page: 1, pageSize: 20 });
    for (const value of [
      { page: 1 },
      { page: '1;DROP TABLE' },
      { page: ['1'] },
      { pageSize: '101' },
      { page: '0' },
    ])
      expect(() => page.transform(value)).toThrow();
  });
});
