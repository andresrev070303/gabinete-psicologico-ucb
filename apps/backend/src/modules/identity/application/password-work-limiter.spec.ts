import { PasswordWorkLimiter } from './password-work-limiter.js';

describe('PasswordWorkLimiter', () => {
  it('bounds password work without queuing and releases the slot on success or failure', async () => {
    const limiter = new PasswordWorkLimiter();
    let release!: () => void;
    const pending = limiter.run(
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    );
    await expect(limiter.run(async () => 'queued')).rejects.toMatchObject({
      kind: 'busy',
    });
    release();
    await pending;
    await expect(
      limiter.run(async () => {
        throw new Error('failed');
      }),
    ).rejects.toThrow('failed');
    await expect(limiter.run(async () => 'available')).resolves.toBe(
      'available',
    );
  });
});
