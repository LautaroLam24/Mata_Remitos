import { Redis } from 'ioredis';
import { config } from '../shared/config.js';

const globalForRedis = globalThis as unknown as { _redis?: Redis };

function createRedis(): Redis {
  if (!config.REDIS_URL) {
    throw new Error(
      'Redis no configurado — REDIS_URL es requerido cuando OCR_SYNC no es "true"',
    );
  }
  return new Redis(config.REDIS_URL, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    lazyConnect: config.NODE_ENV === 'test',
  });
}

export const redis: Redis = globalForRedis._redis ?? createRedis();

if (config.NODE_ENV !== 'production') {
  globalForRedis._redis = redis;
}
