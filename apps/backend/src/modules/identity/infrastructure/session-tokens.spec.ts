import { SessionTokens } from './session-tokens.js';

describe('SessionTokens', () => {
  const codec = new SessionTokens();

  it('issues distinct random credentials and keeps only stable SHA-256 digests', () => {
    const first = codec.issue();
    const second = codec.issue();
    expect(first.token).toMatch(/^[A-Za-z0-9_-]{43}$/u);
    expect(first.token).not.toBe(second.token);
    expect(first.hash).toHaveLength(32);
    expect(codec.hash(first.token)).toEqual(first.hash);
    expect(first.hash.equals(second.hash)).toBe(false);
  });

  it.each([
    '',
    'not-a-token',
    '947043ea-4695-4a4e-a06b-e602cedd26e1',
    'A'.repeat(42),
    'A'.repeat(44),
    `${'A'.repeat(42)}B`,
  ])('rejects malformed or noncanonical credentials', (value) => {
    expect(codec.hash(value)).toBeNull();
  });
});
