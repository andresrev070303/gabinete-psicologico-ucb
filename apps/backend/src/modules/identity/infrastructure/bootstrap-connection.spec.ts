import { assertBootstrapConnection } from './bootstrap-connection.js';

const connection =
  'postgresql://neondb_owner:test-password@ep-test.us-east-1.aws.neon.tech/gabinete_ucb?sslmode=require';

describe('bootstrap connection preconditions', () => {
  it('accepts the direct migration connection without changing it', () => {
    expect(() => assertBootstrapConnection(connection)).not.toThrow();
  });

  it.each([
    undefined,
    '',
    'invalid-url',
    connection.replace('postgresql:', 'https:'),
    connection.replace('/gabinete_ucb', '/neondb'),
    connection.replace('ep-test.', 'ep-test-pooler.'),
    connection.replace('neondb_owner', 'gabinete_app'),
    connection.replace(':test-password', ''),
    connection.replace('require', 'disable'),
    connection.replace('.neon.tech', '.example.test'),
  ])(
    'rejects missing or unsuitable configuration without leaking credentials',
    (value) => {
      expect(() => assertBootstrapConnection(value)).toThrow();
      try {
        assertBootstrapConnection(value);
      } catch (error) {
        expect(String(error)).not.toContain('test-password');
        expect(String(error)).not.toContain('postgresql://');
      }
    },
  );
});
