/** The first account is installed explicitly on the development database, never at startup. */
export function assertBootstrapConnection(
  connectionString: string | undefined,
): asserts connectionString is string {
  if (!connectionString) {
    throw new Error(
      'Set MIGRATION_DATABASE_URL in the local .env.migrations file.',
    );
  }
  let connection: URL;
  try {
    connection = new URL(connectionString);
  } catch {
    throw new Error(
      'MIGRATION_DATABASE_URL is not a valid PostgreSQL connection URL.',
    );
  }
  if (
    !['postgresql:', 'postgres:'].includes(connection.protocol) ||
    connection.pathname !== '/gabinete_ucb' ||
    !connection.hostname.endsWith('.neon.tech') ||
    connection.hostname.includes('-pooler.') ||
    decodeURIComponent(connection.username) === 'gabinete_app' ||
    connection.username.length === 0 ||
    connection.password.length === 0 ||
    !['require', 'verify-full'].includes(
      connection.searchParams.get('sslmode') ?? '',
    )
  ) {
    throw new Error(
      'Use the direct Neon migration connection for development / gabinete_ucb with its owner role and required TLS.',
    );
  }
}
