import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Container } from '../../container.js';
import { enqueueResend } from '../../queue/queues.js';

const periodKeySchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}:(morning|evening)$/, 'periodKey deve ser YYYY-MM-DD:morning|evening');

const resendSchema = z.object({
  periodKey: periodKeySchema,
  force: z.boolean().optional(),
});

/**
 * Endpoints do resumo executivo.
 *   GET  /api/summaries/:periodKey   → conteúdo + status dos disparos
 *   POST /api/summaries/resend       → reenvio manual (assíncrono, 202)
 */
export async function summaryRoutes(app: FastifyInstance, container: Container): Promise<void> {
  const { summaryRepository, dispatchRepository } = container.repositories;

  app.get<{ Params: { periodKey: string } }>(
    '/api/summaries/:periodKey',
    async (request, reply) => {
      const parsed = periodKeySchema.safeParse(request.params.periodKey);
      if (!parsed.success) {
        return reply.status(400).send({ error: parsed.error.flatten() });
      }
      const summary = await summaryRepository.findByPeriodKey(parsed.data);
      if (!summary?.id) {
        return reply.status(404).send({ error: 'Resumo não encontrado para o período.' });
      }
      const dispatchList = await dispatchRepository.findBySummaryId(summary.id);
      return {
        periodKey: summary.periodKey,
        content: summary.content,
        articleRefs: summary.articleRefs,
        createdAt: summary.createdAt,
        dispatches: dispatchList.map((d) => ({
          recipient: d.recipient,
          status: d.status,
          attempts: d.attempts,
          sentAt: d.sentAt,
          error: d.errorMessage,
        })),
      };
    },
  );

  app.post('/api/summaries/resend', async (request, reply) => {
    const parsed = resendSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.flatten() });
    }
    await enqueueResend(parsed.data.periodKey, parsed.data.force ?? false);
    return reply.status(202).send({ accepted: true, periodKey: parsed.data.periodKey });
  });
}
