type Environment = Record<string, string | undefined>;

const POSTGRES_TEST_DATABASE = 'taskforge_test';
const POSTGRES_TEST_PORT = '54330';
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);

/**
 * Rejects every non-local/non-test target before integration code can connect
 * or reset state. Production and remote database URLs are never valid here.
 */
export function requirePostgresTestUrl(environment: Environment): string {
  const value = environment.POSTGRES_TEST_URL;
  if (!value) {
    throw new Error(
      'POSTGRES_TEST_URL is required for PostgreSQL integration tests. Run npm run test:db:up first.',
    );
  }

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error('POSTGRES_TEST_URL must be a valid PostgreSQL URL.');
  }

  if (
    (url.protocol !== 'postgres:' && url.protocol !== 'postgresql:') ||
    !LOCAL_HOSTS.has(url.hostname) ||
    url.port !== POSTGRES_TEST_PORT ||
    url.pathname !== `/${POSTGRES_TEST_DATABASE}`
  ) {
    throw new Error(
      `POSTGRES_TEST_URL must target localhost:${POSTGRES_TEST_PORT}/${POSTGRES_TEST_DATABASE}.`,
    );
  }

  return value;
}
