import { BootstrapAdministrator } from './bootstrap-administrator.js';

const input = {
  givenNames: 'Test',
  familyNames: 'Administrator',
  email: 'admin@example.test',
  password: 'A long test passphrase',
};

function fixture() {
  const store = {
    createFirstAdministrator: vi.fn().mockResolvedValue({
      accountId: 'account-id',
      personId: 'person-id',
      email: input.email,
      roleCode: 'administrator',
    }),
  };
  const hasher = { hash: vi.fn().mockResolvedValue('hashed-password') };
  return { store, hasher, useCase: new BootstrapAdministrator(store, hasher) };
}

describe('BootstrapAdministrator', () => {
  it('normalizes identity fields, hashes the exact password and returns only public identity', async () => {
    const { useCase, store, hasher } = fixture();
    const password = '  a private passphrase  ';
    const result = await useCase.execute({
      ...input,
      givenNames: ' Test ',
      familyNames: ' Administrator ',
      email: ' ADMIN@EXAMPLE.TEST ',
      password,
    });

    expect(hasher.hash).toHaveBeenCalledExactlyOnceWith(password);
    expect(store.createFirstAdministrator).toHaveBeenCalledExactlyOnceWith({
      givenNames: 'Test',
      familyNames: 'Administrator',
      email: input.email,
      passwordHash: 'hashed-password',
    });
    expect(result).toEqual({
      accountId: 'account-id',
      personId: 'person-id',
      email: input.email,
      roleCode: 'administrator',
    });
    expect(JSON.stringify(result)).not.toContain('password');
  });

  it.each([
    ['givenNames', ''],
    ['givenNames', '   '],
    ['givenNames', 'x'.repeat(161)],
    ['familyNames', ''],
    ['familyNames', 'x'.repeat(161)],
    ['email', 'not-an-email'],
    ['email', 'a@@example.test'],
    ['email', 'a b@example.test'],
    ['email', 'a@example'],
    ['email', 'a@.test'],
    ['email', `${'x'.repeat(245)}@example.test`],
    ['password', 'x'.repeat(14)],
    ['password', 'x'.repeat(129)],
  ])(
    'rejects invalid %s without hashing or writing (%s)',
    async (field, value) => {
      const { useCase, store, hasher } = fixture();
      await expect(
        useCase.execute({ ...input, [field]: value }),
      ).rejects.toThrow(field);
      expect(hasher.hash).not.toHaveBeenCalled();
      expect(store.createFirstAdministrator).not.toHaveBeenCalled();
    },
  );

  it.each(['x'.repeat(15), 'x'.repeat(128), '🔐'.repeat(15)])(
    'accepts the password length boundaries and Unicode characters',
    async (password) => {
      const { useCase, hasher } = fixture();
      await useCase.execute({ ...input, password });
      expect(hasher.hash).toHaveBeenCalledExactlyOnceWith(password);
    },
  );

  it('does not write when hashing fails', async () => {
    const { useCase, store, hasher } = fixture();
    hasher.hash.mockRejectedValue(new Error('Hashing unavailable'));
    await expect(useCase.execute(input)).rejects.toThrow('Hashing unavailable');
    expect(store.createFirstAdministrator).not.toHaveBeenCalled();
  });

  it('does not hide a rejected database operation or retry creation', async () => {
    const { useCase, store } = fixture();
    const conflict = new Error('Identity is already initialized.');
    store.createFirstAdministrator.mockRejectedValue(conflict);
    await expect(useCase.execute(input)).rejects.toBe(conflict);
    expect(store.createFirstAdministrator).toHaveBeenCalledTimes(1);
  });
});
