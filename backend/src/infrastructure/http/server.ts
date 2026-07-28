import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import type { Container } from '../container.js';
import { healthRoutes } from './routes/health.js';
import { triggerRoutes } from './routes/trigger.js';
import { newsRoutes } from './routes/news.js';
import { summaryRoutes } from './routes/summaries.js';
import { costRoutes } from './routes/costs.js';

/**
 * Monta a API Fastify. A leitura (news/summaries) alimenta o dashboard; o
 * gatilho (trigger/resend) apenas enfileira e responde 202.
 */
export async function buildServer(container: Container): Promise<FastifyInstance> {
  const app = Fastify({ logger: true });

  // CORS liberado para o frontend local; restrinja em produção.
  await app.register(cors, { origin: true });

  await app.register(healthRoutes);
  await app.register(async (instance) => triggerRoutes(instance));
  await app.register(async (instance) => newsRoutes(instance, container));
  await app.register(async (instance) => summaryRoutes(instance, container));
  await app.register(async (instance) => costRoutes(instance, container));

  return app;
}
