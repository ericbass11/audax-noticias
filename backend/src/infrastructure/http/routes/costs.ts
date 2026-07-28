import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Container } from '../../container.js';

const querySchema = z.object({
  cycles: z.coerce.number().min(1).max(90).optional(),
  days: z.coerce.number().min(1).max(90).optional(),
});

/**
 * Dashboard de custos.
 *   GET /api/costs → relatório de custo/tokens (totais, diário e por ciclo).
 * Os valores em USD são ESTIMATIVA (ver tabela de preços no repositório).
 */
export async function costRoutes(app: FastifyInstance, container: Container): Promise<void> {
  const { getCostReport } = container.useCases;

  app.get('/api/costs', async (request, reply) => {
    const parsed = querySchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.flatten() });
    }
    return getCostReport.execute(parsed.data);
  });
}
