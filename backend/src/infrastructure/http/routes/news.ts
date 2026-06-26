import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Container } from '../../container.js';

const listQuerySchema = z.object({
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'date deve ser YYYY-MM-DD')
    .optional(),
  category: z.string().optional(),
  limit: z.coerce.number().min(1).max(500).optional(),
});

/**
 * Endpoints de leitura consumidos pelo dashboard (Next.js).
 *   GET /api/news            → feed com filtro por data/categoria
 *   GET /api/news/categories → categorias para o filtro
 *   GET /api/news/:id        → detalhe + análise profunda (portal)
 */
export async function newsRoutes(app: FastifyInstance, container: Container): Promise<void> {
  const { newsFeedQuery } = container.queries;

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
}
