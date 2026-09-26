import { getPostgresConfig } from './database.config';

describe('getPostgresConfig', () => {
  it('uses safe defaults while PostgreSQL is not wired into the runtime', () => {
    expect(getPostgresConfig({})).toEqual({
      url: undefined,
      migrationUrl: undefined,
      ssl: false,
      sslRejectUnauthorized: true,
      sslCa: undefined,
      poolMax: 5,
      connectionTimeoutMs: 5000,
      synchronize: false,
    });
  });

  it('accepts a PostgreSQL URL and explicit SSL configuration', () => {
    expect(
      getPostgresConfig({
        DATABASE_URL:
          'postgresql://user:password@db.example.test:5432/taskforge',
        MIGRATION_DATABASE_URL:
          'postgresql://user:password@migration.example.test:5432/taskforge',
        DATABASE_SSL: 'true',
        DATABASE_SSL_REJECT_UNAUTHORIZED: 'false',
        DATABASE_POOL_MAX: '7',
        DATABASE_CONNECTION_TIMEOUT_MS: '2500',
        DATABASE_SYNCHRONIZE: 'false',
      }),
    ).toEqual({
      url: 'postgresql://user:password@db.example.test:5432/taskforge',
      migrationUrl:
        'postgresql://user:password@migration.example.test:5432/taskforge',
      ssl: true,
      sslRejectUnauthorized: false,
      poolMax: 7,
      connectionTimeoutMs: 2500,
      synchronize: false,
    });
  });

  it('rejects malformed values and synchronize being enabled', () => {
    expect(() => getPostgresConfig({ DATABASE_URL: 'not-a-url' })).toThrow(
      'DATABASE_URL',
    );
    expect(() => getPostgresConfig({ DATABASE_SSL: 'yes' })).toThrow(
      'DATABASE_SSL',
    );
    expect(() =>
      getPostgresConfig({ DATABASE_SSL_REJECT_UNAUTHORIZED: 'yes' }),
    ).toThrow('DATABASE_SSL_REJECT_UNAUTHORIZED');
    expect(() => getPostgresConfig({ DATABASE_SYNCHRONIZE: 'true' })).toThrow(
      'DATABASE_SYNCHRONIZE',
    );
    expect(() => getPostgresConfig({ DATABASE_POOL_MAX: '0' })).toThrow(
      'DATABASE_POOL_MAX',
    );
    expect(() =>
      getPostgresConfig({ DATABASE_CONNECTION_TIMEOUT_MS: '-1' }),
    ).toThrow('DATABASE_CONNECTION_TIMEOUT_MS');
    expect(getPostgresConfig({ POSTGRES_URL: 'postgresql://legacy' }).url).toBe(
      undefined,
    );
    expect(() =>
      getPostgresConfig({ DATABASE_SSL_CA_BASE64: 'not-a-pem' }),
    ).toThrow('DATABASE_SSL_CA_BASE64');
  });

  it('requires verified TLS for production connections', () => {
    expect(() =>
      getPostgresConfig({
        NODE_ENV: 'production',
        DATABASE_SSL: 'true',
        DATABASE_SSL_REJECT_UNAUTHORIZED: 'false',
      }),
    ).toThrow('Production TLS connections require');
  });

  it('accepts a base64-encoded PEM root certificate', () => {
    const certificate =
      '-----BEGIN CERTIFICATE-----\nexample\n-----END CERTIFICATE-----';

    expect(
      getPostgresConfig({
        DATABASE_SSL_CA_BASE64: Buffer.from(certificate).toString('base64'),
      }).sslCa,
    ).toBe(certificate);
  });
});
