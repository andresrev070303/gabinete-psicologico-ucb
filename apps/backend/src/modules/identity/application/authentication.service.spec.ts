import { AuthenticationService } from './authentication.service.js';

const identity = {
  accountId: 'account',
  email: 'admin@example.test',
  givenNames: 'Test',
  familyNames: 'Admin',
  roles: ['administrator'],
  permissions: ['roles.read'],
};
const credentials = {
  accountId: 'account',
  passwordHash: 'stored-hash',
  accountStatus: 'active',
  authMethod: 'local',
  personActive: true,
  mfaEnabled: false,
};

function fixture() {
  const store = {
    signIn: vi.fn(async (_input, verify) =>
      (await verify(credentials))
        ? {
            kind: 'success',
            identity,
            session: {
              id: 'session',
              createdAt: new Date().toISOString(),
              expiresAt: new Date(Date.now() + 1000).toISOString(),
            },
          }
        : { kind: 'invalid_credentials' },
    ),
    authenticate: vi.fn(),
    signOut: vi.fn(),
    touch: vi.fn(),
  };
  const passwords = { verify: vi.fn().mockResolvedValue(true) };
  const tokens = {
    issue: () => ({ token: 'A'.repeat(43), hash: Buffer.alloc(32) }),
    hash: vi.fn(),
  };
  return {
    store,
    passwords,
    service: new AuthenticationService(store, passwords, tokens),
  };
}

describe('AuthenticationService', () => {
  it('normalizes the email, preserves the password and returns a new opaque credential separately from the identity', async () => {
    const { service, store, passwords } = fixture();
    const result = await service.signIn(
      { email: ' ADMIN@EXAMPLE.TEST ', password: ' exact password ' },
      'request',
    );
    expect(passwords.verify).toHaveBeenCalledExactlyOnceWith(
      ' exact password ',
      'stored-hash',
    );
    expect(store.signIn.mock.calls[0][0].email).toBe('admin@example.test');
    expect(result.identity).toEqual(identity);
    expect(result.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(JSON.stringify(result.identity)).not.toContain('token');
    expect(JSON.stringify(result.identity)).not.toContain('Hash');
  });

  it.each([
    null,
    { ...credentials, accountStatus: 'disabled' },
    { ...credentials, accountStatus: 'invited' },
    { ...credentials, personActive: false },
    { ...credentials, authMethod: 'institutional_sso' },
    { ...credentials, mfaEnabled: true },
  ])(
    'performs the password verification but rejects an ineligible or unknown account',
    async (candidate) => {
      const { service, store, passwords } = fixture();
      store.signIn.mockImplementationOnce(async (_input, verify) => {
        expect(await verify(candidate)).toBe(false);
        return { kind: 'invalid_credentials' };
      });
      await expect(
        service.signIn(
          { email: 'admin@example.test', password: 'password' },
          'request',
        ),
      ).rejects.toMatchObject({ kind: 'invalid_credentials' });
      expect(passwords.verify).toHaveBeenCalledOnce();
    },
  );

  it('rejects an incorrect password using the same credential error', async () => {
    const { service, passwords } = fixture();
    passwords.verify.mockResolvedValue(false);
    await expect(
      service.signIn(
        { email: 'admin@example.test', password: 'wrong' },
        'request',
      ),
    ).rejects.toMatchObject({ kind: 'invalid_credentials' });
  });

  it('reports the persisted attempt limit without creating a cookie credential', async () => {
    const { service, store } = fixture();
    store.signIn.mockResolvedValueOnce({ kind: 'rate_limited' });
    await expect(
      service.signIn(
        { email: 'admin@example.test', password: 'password' },
        'request',
      ),
    ).rejects.toMatchObject({ kind: 'rate_limited' });
  });

  it('limits concurrent expensive hashes and releases the slot after failure', async () => {
    const { service, passwords } = fixture();
    let rejectHash;
    passwords.verify.mockReturnValueOnce(
      new Promise((_resolve, reject) => {
        rejectHash = reject;
      }),
    );
    const first = service.signIn(
      { email: 'admin@example.test', password: 'password' },
      'first',
    );
    await expect(
      service.signIn(
        { email: 'other@example.test', password: 'password' },
        'second',
      ),
    ).rejects.toMatchObject({ kind: 'busy' });
    rejectHash(new Error('Hash unavailable'));
    await expect(first).rejects.toThrow('Hash unavailable');
    await expect(
      service.signIn(
        { email: 'admin@example.test', password: 'password' },
        'third',
      ),
    ).resolves.toHaveProperty('identity');
  });
});
