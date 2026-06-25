import { Redis } from 'ioredis';
import { env } from '../config/env.js';

/**
 * Conexão Redis compartilhada para a fila. BullMQ exige
 * `maxRetriesPerRequest: null` nas conexões usadas por workers.
 */
export const redisConnection = new Redis(env.REDIS_URL, {
  maxRetriesPerRequest: null,
});
