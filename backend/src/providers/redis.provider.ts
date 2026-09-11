import Redis from 'ioredis';
import { getRedisConnection } from '../config/redis.config';

export const REDIS_CLIENT = 'REDIS_CLIENT';

export const redisProvider = {
  provide: REDIS_CLIENT,
  useFactory: (): Redis => {
    const client = new Redis({
      ...getRedisConnection(process.env),
      // Tự động reconnect khi mất kết nối
      retryStrategy: (times: number) => {
        const delay = Math.min(times * 100, 3000);
        return delay;
      },
      lazyConnect: false,
      maxRetriesPerRequest: 3,
    });

    client.on('connect', () => {
      console.log('Connected to Redis');
    });

    client.on('error', (err) => {
      console.error('Redis Client Error:', err.message);
    });

    client.on('reconnecting', () => {
      console.warn('Redis reconnecting...');
    });

    return client;
  },
};
