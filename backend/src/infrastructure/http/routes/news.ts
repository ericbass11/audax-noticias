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
}
