import { getRedisConnection } from './redis.config';

describe('getRedisConnection', () => {
  it('parses a managed Redis TLS connection URL', () => {
    expect(
      getRedisConnection({
        REDIS_URL: 'rediss://user:password@cache.example.test:6380/2',
      }),
    ).toEqual({
      host: 'cache.example.test',
      port: 6380,
      username: 'user',
      password: 'password',
      db: 2,
      tls: {},
    });
  });

  it('uses host, port, and password when no URL is configured', () => {
    expect(
      getRedisConnection({
        REDIS_HOST: 'localhost',
        REDIS_PORT: '6380',
        REDIS_PASSWORD: 'local-password',
      }),
    ).toEqual({
      host: 'localhost',
      port: 6380,
      password: 'local-password',
    });
  });
});
