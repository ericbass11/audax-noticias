import { env } from './infrastructure/config/env.js';
import { buildContainer } from './infrastructure/container.js';
import { buildServer } from './infrastructure/http/server.js';
import { startWorker } from './infrastructure/queue/worker.js';
import { startScheduler } from './infrastructure/cron/scheduler.js';

/**
 * Bootstrap / composition root.
 *
 * Liga, no mesmo processo:
 *   - API HTTP (Fastify): leitura para o dashboard + gatilho assíncrono (202)
 *   - Worker BullMQ: processa coleta → classificação → resumo → disparo
 *   - Cron (node-cron): enfileira ciclos 2x ao dia (08:00 / 18:00 BRT)
 *
 * Manter os três juntos simplifica o deploy local (um container). Para escalar,
 * dá para separar worker e cron em processos próprios reusando o container.
 */
async function bootstrap(): Promise<void> {
  const container = buildContainer();

  const worker = startWorker(container);
  const tasks = startScheduler();

  const app = await buildServer(container);
  await app.listen({ host: '0.0.0.0', port: env.PORT });

  console.log(`🚀 Audax Notícias no ar — http://localhost:${env.PORT} (${env.NODE_ENV})`);

  // Diagnóstico da Evolution logo no boot: sabor errado para a BASE_URL só
  // aparecia como 404 na hora do disparo, horas depois. Não bloqueia a subida.
  void container.gateways.whatsapp.checkHealth().then(({ ok, detail }) => {
    if (ok) {
      console.log(
        `📱 Evolution ok (${env.EVOLUTION_API_FLAVOR}) em ${env.EVOLUTION_BASE_URL}: ${detail}`,
      );
    } else {
      console.error(`❌ Evolution NÃO utilizável — os disparos vão falhar. ${detail}`);
    }
  });

  const shutdown = async (signal: string) => {
    console.log(`\n${signal} recebido — encerrando...`);
    tasks.forEach((t) => t.stop());
    await worker.close();
    await app.close();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

bootstrap().catch((err) => {
  console.error('❌ Falha no bootstrap:', err);
  process.exit(1);
});
