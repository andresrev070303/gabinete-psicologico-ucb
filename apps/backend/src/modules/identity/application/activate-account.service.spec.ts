import { ActivateAccountService } from './activate-account.service.js';
import { PasswordWorkLimiter } from './password-work-limiter.js';
import { SessionTokens } from '../infrastructure/session-tokens.js';

describe('ActivateAccountService', () => {
  const codec = new SessionTokens();
  function fixture() {
    const store = {
      isPendingActivation: vi.fn().mockResolvedValue(true),
      activate: vi.fn().mockResolvedValue(undefined),
    };
    const passwords = { hash: vi.fn().mockResolvedValue('password-hash') };
    return {
      store,
      passwords,
      service: new ActivateAccountService(
        store,
        passwords,
        codec,
        new PasswordWorkLimiter(),
      ),
    };
  }
  it('hashes an eligible password and passes only credential hashes to persistence', async () => {
    const { service, store, passwords } = fixture();
    const secret = codec.issue();
    await service.activate(
      { token: secret.token, password: ' exact passphrase ' },
      'request',
    );
    expect(passwords.hash).toHaveBeenCalledExactlyOnceWith(
      ' exact passphrase ',
    );
    expect(store.activate).toHaveBeenCalledExactlyOnceWith(
      secret.hash,
      'password-hash',
      'request',
    );
  });
  it.each(['malformed', 'unknown'])(
    'rejects a %s action token before expensive password work',
    async (kind) => {
      const { service, store, passwords } = fixture();
      store.isPendingActivation.mockResolvedValue(false);
      await expect(
        service.activate(
          {
            token: kind === 'malformed' ? 'bad' : codec.issue().token,
            password: 'a long passphrase',
          },
          'request',
        ),
      ).rejects.toMatchObject({ kind: 'invalid_activation' });
      expect(passwords.hash).not.toHaveBeenCalled();
      expect(store.activate).not.toHaveBeenCalled();
    },
  );
});
