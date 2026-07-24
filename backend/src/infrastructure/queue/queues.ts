import { Queue } from 'bullmq';
import { redisConnection } from './connection.js';
import type { TriggerType } from '../../modules/shared/domain/ProcessingRun.js';

export const NEWS_QUEUE_NAME = 'news';

/** Tipos de job processados pela fila. */
export type NewsJob =
  | { type: 'cycle'; periodKey: string; triggerType: TriggerType; force?: boolean }
  | { type: 'resend'; periodKey: string; force?: boolean }
  | { type: 'promote'; periodKey: string };

/**
 * Fila única de processamento assíncrono. O endpoint de gatilho enfileira e
 * responde 202 imediatamente; o cron enfileira nos horários definidos. O
 * trabalho pesado (coleta/classificação/disparo) roda no worker, fora do
 * ciclo de request.
 */
export const newsQueue = new Queue<NewsJob, unknown, string>(NEWS_QUEUE_NAME, {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 5000 },
    removeOnComplete: 100,
    removeOnFail: 200,
  },
});

/**
 * Enfileira um ciclo. `jobId = cycle:<periodKey>` dá uma camada extra de
 * idempotência: dois gatilhos no mesmo turno colapsam no mesmo job enquanto
 * ele não foi removido.
 */
export async function enqueueCycle(
  periodKey: string,
  triggerType: TriggerType,
  force = false,
): Promise<void> {
  await newsQueue.add(
    'cycle',
    { type: 'cycle', periodKey, triggerType, force },
    { jobId: force ? undefined : `cycle:${periodKey}` },
  );
}

export async function enqueueResend(periodKey: string, force = false): Promise<void> {
  await newsQueue.add('resend', { type: 'resend', periodKey, force });
}

/**
 * Enfileira a PROMOÇÃO ao grupo (após o preview no número pessoal), com atraso.
 * `jobId = promote:<periodKey>` evita duplicar a promoção do mesmo turno.
 */
export async function enqueuePromote(periodKey: string, delayMs: number): Promise<void> {
  await newsQueue.add(
    'promote',
    { type: 'promote', periodKey },
    { delay: Math.max(0, delayMs), jobId: `promote:${periodKey}` },
  );
}
