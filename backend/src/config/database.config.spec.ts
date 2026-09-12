import { getPostgresConfig } from './database.config';

describe('getPostgresConfig', () => {
  it('uses safe defaults while PostgreSQL is not wired into the runtime', () => {
    expect(getPostgresConfig({})).toEqual({
      url: undefined,
      ssl: false,
      sslRejectUnauthorized: true,
      synchronize: false,
    });
  });

  it('accepts a PostgreSQL URL and explicit SSL configuration', () => {
    expect(
      getPostgresConfig({
        POSTGRES_URL:
          'postgresql://user:password@db.example.test:5432/taskforge',
        POSTGRES_SSL: 'true',
        POSTGRES_SSL_REJECT_UNAUTHORIZED: 'false',
        POSTGRES_SYNCHRONIZE: 'false',
      }),
    ).toEqual({
      url: 'postgresql://user:password@db.example.test:5432/taskforge',
      ssl: true,
      sslRejectUnauthorized: false,
      synchronize: false,
    });
  });

  it('rejects malformed values and synchronize being enabled', () => {
    expect(() => getPostgresConfig({ POSTGRES_URL: 'not-a-url' })).toThrow(
      'POSTGRES_URL',
    );
    expect(() => getPostgresConfig({ POSTGRES_SSL: 'yes' })).toThrow(
      'POSTGRES_SSL',
    );
    expect(() =>
      getPostgresConfig({ POSTGRES_SSL_REJECT_UNAUTHORIZED: 'yes' }),
    ).toThrow('POSTGRES_SSL_REJECT_UNAUTHORIZED');
    expect(() => getPostgresConfig({ POSTGRES_SYNCHRONIZE: 'true' })).toThrow(
      'POSTGRES_SYNCHRONIZE',
    );
  });
});
