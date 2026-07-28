import { Worker } from 'bullmq';
import { createRedisConnection } from './connection.js';
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
        // Falha (ex.: coleta caiu por queda de rede) → LANÇA para o BullMQ
        // reprocessar (attempts + backoff). Assim um blip de rede não vira turno
        // perdido: ele tenta de novo e pega a rede quando ela voltar.
        if (result.status === 'failed') {
          throw new Error(`Ciclo ${data.periodKey} falhou: ${result.reason ?? 'motivo desconhecido'}`);
        }
        console.log(`✅ Ciclo ${data.periodKey}:`, result);
        // Modo preview: agenda a promoção ao grupo SÓ se um digest real (notícias/
        // FIDC) foi ao número pessoal — não promove turno vazio. O delay do BullMQ
        // sobrevive a restart.
        if (previewMode && result.status === 'completed' && result.dispatchedToPreview) {
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
    // Conexão DEDICADA para o worker (comandos bloqueantes) — não compartilhar
    // com a Queue, sob risco de deadlock no enqueue.
    { connection: createRedisConnection(), concurrency: 1 },
  );

  worker.on('failed', (job, err) => {
    console.error(`❌ Job ${job?.id} falhou:`, err.message);
  });

  return worker;
}
