import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Container } from '../../container.js';

const listQuerySchema = z.object({
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'date deve ser YYYY-MM-DD')
    .optional(),
  category: z.string().optional(),
  track: z.enum(['news', 'watchlist']).optional(),
  limit: z.coerce.number().min(1).max(500).optional(),
});

/**
 * Endpoints de leitura consumidos pelo dashboard (Next.js).
 *   GET /api/news            → feed com filtro por data/categoria
 *   GET /api/news/categories → categorias para o filtro
 *   GET /api/news/:id        → detalhe + análise profunda (portal)
 */
const chatBodySchema = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant']),
        content: z.string().min(1),
      }),
    )
    .min(1)
    .max(40),
});

export async function newsRoutes(app: FastifyInstance, container: Container): Promise<void> {
  const { newsFeedQuery } = container.queries;
  const { answerNewsChat } = container.useCases;

  app.get('/api/news', async (request, reply) => {
    const parsed = listQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.flatten() });
    }
    const items = await newsFeedQuery.list(parsed.data);
    return { items, count: items.length };
  });

  app.get('/api/news/categories', async () => {
    const categories = await newsFeedQuery.categories();
    return { categories };
  });

  // Detalhe de uma notícia (com a análise profunda) — consumido pelo portal.
  app.get('/api/news/:id', async (request, reply) => {
    const params = z.object({ id: z.string().uuid() }).safeParse(request.params);
    if (!params.success) {
      return reply.status(400).send({ error: 'id inválido' });
    }
    const detail = await newsFeedQuery.detail(params.data.id);
    if (!detail) {
      return reply.status(404).send({ error: 'notícia não encontrada' });
    }
    return detail;
  });

  // Chat sobre a notícia — resposta em STREAMING (text/plain, token a token).
  app.post('/api/news/:id/chat', async (request, reply) => {
    const params = z.object({ id: z.string().uuid() }).safeParse(request.params);
    const body = chatBodySchema.safeParse(request.body);
    if (!params.success || !body.success) {
      return reply.status(400).send({ error: 'requisição inválida' });
    }

    reply.raw.setHeader('Content-Type', 'text/plain; charset=utf-8');
    reply.raw.setHeader('Cache-Control', 'no-cache');
    reply.raw.setHeader('Access-Control-Allow-Origin', request.headers.origin ?? '*');
    reply.hijack();

    try {
      await answerNewsChat.execute(params.data.id, body.data.messages, (token) => {
        reply.raw.write(token);
      });
    } catch (err) {
      reply.raw.write(`\n[erro: ${(err as Error).message}]`);
    } finally {
      reply.raw.end();
    }
  });
}
