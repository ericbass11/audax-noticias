import { Worker } from 'bullmq';
import { redisConnection } from './connection.js';
import { NEWS_QUEUE_NAME, enqueuePromote, type NewsJob } from './queues.js';
import { env } from '../config/env.js';
import type { Container } from '../container.js';

/**
 * Worker que consome a fila `news`. Roda embutido no próprio serviço
 * (não bloqueia a API). Processa ciclos, reenvios e a promoção ao grupo.
 */
export function startWorker(container: Container): Worker<NewsJob> {
  const { runNewsCycle, resendSummary, promoteToGroup } = container.useCases;
  const previewMode = env.PREVIEW_ENABLED && env.evolutionRecipientsPreview.length > 0;

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
        // Modo preview: já disparou ao número pessoal; agenda a promoção ao
        // grupo após o atraso configurado (delay do BullMQ sobrevive a restart).
        if (previewMode && result.status === 'completed') {
          const delayMs = env.PREVIEW_PROMOTE_DELAY_MINUTES * 60 * 1000;
          await enqueuePromote(data.periodKey, delayMs);
          console.log(
            `🕒 Preview enviado; promoção ao grupo agendada em ${env.PREVIEW_PROMOTE_DELAY_MINUTES} min (${data.periodKey}).`,
          );
        }
        return result;
      }
      if (data.type === 'resend') {
        console.log(`⚙️  Reenviando resumo ${data.periodKey}`);
        const result = await resendSummary.execute(data.periodKey, data.force);
        console.log(`✅ Reenvio ${data.periodKey}:`, result);
        return result;
      }
      if (data.type === 'promote') {
        console.log(`📢 Promovendo ao grupo ${data.periodKey}`);
        const result = await promoteToGroup.execute(data.periodKey);
        console.log(`✅ Promoção ${data.periodKey}:`, result);
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
