import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { env } from '../../config/env.js';
import { PeriodKey, type DayPeriod } from '../../../modules/shared/domain/PeriodKey.js';
import { enqueueCycle } from '../../queue/queues.js';

const triggerSchema = z.object({
  // Opcional: força um turno específico do dia de hoje; senão deriva da hora.
  period: z.enum(['morning', 'evening']).optional(),
  force: z.boolean().optional(),
});

/**
 * Gatilho manual de coleta/classificação/disparo.
 * Responde 202 imediatamente e processa via fila (sem timeout).
 */
export async function triggerRoutes(app: FastifyInstance): Promise<void> {
  app.post('/api/trigger', async (request, reply) => {
    const parsed = triggerSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.flatten() });
    }

    const now = new Date();
    const periodKey = parsed.data.period
      ? PeriodKey.create(
          PeriodKey.fromDate(now, env.TZ).date,
          parsed.data.period as DayPeriod,
        ).toString()
      : PeriodKey.fromDate(now, env.TZ).toString();

    await enqueueCycle(periodKey, 'manual', parsed.data.force ?? false);

    return reply.status(202).send({
      accepted: true,
      periodKey,
      message: 'Ciclo enfileirado. Acompanhe o processamento de forma assíncrona.',
    });
  });
}
