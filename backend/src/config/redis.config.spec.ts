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

  it('defaults to database 0 when a Redis URL has no database path', () => {
    expect(
      getRedisConnection({
        REDIS_URL: 'rediss://default:password@cache.example.test:6380',
      }),
    ).toEqual({
      host: 'cache.example.test',
      port: 6380,
      username: 'default',
      password: 'password',
      tls: {},
    });
  });

  it('rejects a Redis URL with an invalid database path', () => {
    expect(() =>
      getRedisConnection({
        REDIS_URL: 'rediss://default:password@cache.example.test:6380/not-a-db',
      }),
    ).toThrow('REDIS_URL path');
  });
});
