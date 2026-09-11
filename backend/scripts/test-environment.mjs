const TEST_URL =
  'postgresql://taskforge_test:taskforge_test@localhost:54330/taskforge_test';

export function postgresTestEnvironment() {
  const url = new URL(process.env.POSTGRES_TEST_URL ?? TEST_URL);
  const isSafeTarget =
    ['localhost', '127.0.0.1', '::1'].includes(url.hostname) &&
    url.port === '54330' &&
    url.pathname === '/taskforge_test';

  if (!isSafeTarget) {
    throw new Error(
      'POSTGRES_TEST_URL must target localhost:54330/taskforge_test; refusing a non-test database.',
    );
  }

  return {
    ...process.env,
    POSTGRES_TEST_URL: url.toString(),
    POSTGRES_URL: url.toString(),
    POSTGRES_SSL: 'false',
    POSTGRES_SYNCHRONIZE: 'false',
    MINIO_ENDPOINT: '127.0.0.1',
    MINIO_PORT: '9002',
    MINIO_USE_SSL: 'false',
    MINIO_ACCESS_KEY: 'taskforge-minio-test',
    MINIO_SECRET_KEY: 'taskforge-minio-test-secret',
    MINIO_BUCKET: 'taskforge-file-tests',
    NODE_ENV: 'test',
    JWT_ACCESS_SECRET:
      process.env.JWT_ACCESS_SECRET ?? 'local-test-access-secret',
    JWT_REFRESH_SECRET:
      process.env.JWT_REFRESH_SECRET ?? 'local-test-refresh-secret',
    JWT_VERIFIED_SECRET:
      process.env.JWT_VERIFIED_SECRET ?? 'local-test-verified-secret',
    JWT_ACCESS_EXPIRES_IN: process.env.JWT_ACCESS_EXPIRES_IN ?? '15m',
    JWT_REFRESH_EXPIRES_IN: process.env.JWT_REFRESH_EXPIRES_IN ?? '7d',
    JWT_VERIFIED_EXPIRES_IN: process.env.JWT_VERIFIED_EXPIRES_IN ?? '10m',
    EMAIL_USER: process.env.EMAIL_USER ?? 'test@example.test',
    EMAIL_PASS: process.env.EMAIL_PASS ?? 'not-used-in-runtime-smoke',
  };
}
