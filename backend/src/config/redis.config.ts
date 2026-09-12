import type { RedisOptions } from 'ioredis';

type Environment = Record<string, string | undefined>;

export type RedisConnection = RedisOptions;

export function getRedisConnection(environment: Environment): RedisConnection {
  const url = environment.REDIS_URL?.trim();

  if (url) {
    return parseRedisUrl(url);
  }

  return {
    host: environment.REDIS_HOST,
    port: Number.parseInt(environment.REDIS_PORT ?? '6379', 10),
    password: environment.REDIS_PASSWORD,
  };
}

function parseRedisUrl(value: string): RedisOptions {
  const url = new URL(value);

  if (url.protocol !== 'redis:' && url.protocol !== 'rediss:') {
    throw new Error('REDIS_URL must use the redis:// or rediss:// protocol.');
  }

  const connection: RedisOptions = {
    host: url.hostname,
    port: Number.parseInt(url.port || '6379', 10),
  };

  if (url.username) {
    connection.username = decodeURIComponent(url.username);
  }

  if (url.password) {
    connection.password = decodeURIComponent(url.password);
  }

  if (url.pathname && url.pathname !== '/') {
    const database = Number(url.pathname.slice(1));
    if (!Number.isInteger(database) || database < 0) {
      throw new Error(
        'REDIS_URL path must be a non-negative Redis database index.',
      );
    }
    connection.db = database;
  }

  if (url.protocol === 'rediss:') {
    connection.tls = {};
  }

  return connection;
}
