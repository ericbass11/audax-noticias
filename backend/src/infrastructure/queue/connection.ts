import { Redis } from 'ioredis';
import { env } from '../config/env.js';

/**
 * Cria uma NOVA conexão Redis para o BullMQ.
 *
 * BullMQ exige `maxRetriesPerRequest: null`. Mais importante: o Worker usa
 * comandos BLOQUEANTES (BZPOPMIN) que monopolizam a conexão enquanto espera
 * um job. Se a Queue (produtor) e o Worker (consumidor) compartilham a MESMA
 * conexão, o `queue.add()` fica preso atrás do bloqueio do worker e o job
 * nunca chega a ser criado — deadlock. Por isso o Worker recebe uma conexão
 * dedicada (ver worker.ts).
 */
export function createRedisConnection(): Redis {
  return new Redis(env.REDIS_URL, {
    maxRetriesPerRequest: null,
  });
}

/** Conexão para o produtor (Queue) e comandos avulsos (não bloqueantes). */
export const redisConnection = createRedisConnection();
