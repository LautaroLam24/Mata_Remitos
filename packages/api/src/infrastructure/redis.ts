import { Redis } from 'ioredis';
import { config } from '../shared/config.js';

const globalForRedis = globalThis as unknown as { _redis?: Redis };

export const redis =
  globalForRedis._redis ??
  new Redis(config.REDIS_URL, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    lazyConnect: config.NODE_ENV === 'test',
  });

if (config.NODE_ENV !== 'production') {
  globalForRedis._redis = redis;
}
