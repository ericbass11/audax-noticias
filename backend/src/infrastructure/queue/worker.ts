import { Worker } from 'bullmq';
import { redisConnection } from './connection.js';
import { NEWS_QUEUE_NAME, type NewsJob } from './queues.js';
import type { Container } from '../container.js';

/**
 * Worker que consome a fila `news`. Roda embutido no próprio serviço
 * (não bloqueia a API). Processa ciclos completos e reenvios.
 */
export function startWorker(container: Container): Worker<NewsJob> {
  const { runNewsCycle, resendSummary } = container.useCases;

  const worker = new Worker<NewsJob, unknown, string>(
    NEWS_QUEUE_NAME,
    async (job) => {
      const data = job.data;
      if (data.type === 'cycle') {
        console.log(`⚙️  Processando ciclo ${data.periodKey} (${data.triggerType})`);
        const result = await runNewsCycle.execute({
          periodKey: data.periodKey,
          triggerType: data.triggerType,
          force: data.force,
        });
        console.log(`✅ Ciclo ${data.periodKey}:`, result);
        return result;
      }
      if (data.type === 'resend') {
        console.log(`⚙️  Reenviando resumo ${data.periodKey}`);
        const result = await resendSummary.execute(data.periodKey, data.force);
        console.log(`✅ Reenvio ${data.periodKey}:`, result);
        return result;
      }
      throw new Error(`Tipo de job desconhecido`);
    },
    { connection: redisConnection, concurrency: 1 },
  );

  worker.on('failed', (job, err) => {
    console.error(`❌ Job ${job?.id} falhou:`, err.message);
  });

  return worker;
}
